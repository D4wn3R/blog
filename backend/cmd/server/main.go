// 博客后端入口：配置加载、依赖组装（MySQL/Redis/RustFS/OAuth）与服务生命周期管理
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
	"github.com/uptrace/opentelemetry-go-extra/otelgorm"
	gormmysql "gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/D4wn3R/blog/backend/internal/config"
	"github.com/D4wn3R/blog/backend/internal/handler"
	"github.com/D4wn3R/blog/backend/internal/model"
	"github.com/D4wn3R/blog/backend/internal/pkg/metrics"
	"github.com/D4wn3R/blog/backend/internal/pkg/oauth"
	"github.com/D4wn3R/blog/backend/internal/pkg/redis"
	"github.com/D4wn3R/blog/backend/internal/pkg/rustfs"
	"github.com/D4wn3R/blog/backend/internal/pkg/tracing"
	"github.com/D4wn3R/blog/backend/internal/repository"
	"github.com/D4wn3R/blog/backend/internal/router"
	"github.com/D4wn3R/blog/backend/internal/service"
)

// slogWriter 把 GORM logger 的 Printf 输出桥接到 slog，保持全站 JSON 结构化日志
type slogWriter struct{}

func (slogWriter) Printf(format string, args ...any) {
	slog.Info(fmt.Sprintf(format, args...))
}

func main() {
	// slog JSON 全局默认 logger（规范 §1/§5：结构化日志；request_id 由 RequestID 中间件注入请求 context）
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	migrate := flag.Bool("migrate", false, "执行数据库迁移后退出")
	configPath := flag.String("config", "configs/config.yaml", "配置文件路径")
	flag.Parse()

	if err := run(*configPath, *migrate); err != nil {
		slog.Error("服务退出", "err", err)
		os.Exit(1)
	}
}

// run 主流程：配置加载 → 依赖组装 → 服务生命周期。错误统一向上抛，
// 由 main 唯一出口处理（规范 §3：os.Exit 只在 main，defer 得以执行）
func run(configPath string, migrate bool) error {
	// 加载工作目录下的 .env（backend/.env，模板见 .env.example）：
	// 键名即环境变量名（BLOG_ 前缀），不覆盖已存在的真实环境变量，
	// 优先级：真实环境变量 > .env > configs/config.yaml；文件不存在则静默跳过
	if err := godotenv.Load(); err != nil {
		slog.Info("未找到 .env，跳过（配置走 config.yaml 与真实环境变量）")
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		return fmt.Errorf("加载配置失败: %w", err)
	}

	// 链路追踪初始化（Enabled=false 时为空 Provider，不建立任何连接）。
	// 必须在 gorm.Open 之前完成——GORM 插件从全局 TracerProvider 取 tracer
	tracer, err := tracing.New(context.Background(), tracing.Config{
		Enabled:     cfg.Tracing.Enabled,
		Endpoint:    cfg.Tracing.Endpoint,
		Insecure:    cfg.Tracing.Insecure,
		SampleRatio: cfg.Tracing.SampleRatio,
		ServiceName: cfg.Tracing.ServiceName,
		Environment: cfg.Tracing.Environment,
	})
	if err != nil {
		return fmt.Errorf("初始化链路追踪失败: %w", err)
	}
	// defer 的 LIFO 保证 flush 发生在 HTTP 服务停止之后：
	// BatchSpanProcessor 异步批量上报，不 flush 则缓冲区里的 span 随进程丢失
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := tracer.Shutdown(shutdownCtx); err != nil {
			slog.Warn("关闭链路追踪失败", "err", err)
		}
	}()

	gin.SetMode(cfg.Server.Mode)

	// MySQL：GORM 慢查询/错误经 slog 输出（release 不打印 SQL，Warn 级含慢查询）
	gormLogger := logger.New(slogWriter{}, logger.Config{
		SlowThreshold: 200 * time.Millisecond,
		LogLevel:      logger.Warn,
	})
	db, err := gorm.Open(gormmysql.Open(cfg.MySQL.DSN), &gorm.Config{Logger: gormLogger})
	if err != nil {
		return fmt.Errorf("连接 MySQL 失败: %w", err)
	}
	// GORM 插件：每条 SQL 自动生成子 span。关掉插件自带的 metrics——
	// 本阶段只做 trace，避免向全局 MeterProvider 注册无用指标。
	// 选 uptrace/otelgorm 而非 gorm.io/plugin/opentelemetry：后者在非测试代码里
	// 硬 import ClickHouse/Postgres 驱动，会给本项目凭空带入两个用不到的驱动
	if tracer.Enabled() {
		if err := db.Use(otelgorm.NewPlugin(
			otelgorm.WithTracerProvider(tracer.TracerProvider()),
			otelgorm.WithoutMetrics(),
		)); err != nil {
			return fmt.Errorf("注册 GORM 链路追踪插件失败: %w", err)
		}
	}
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("获取底层 sql.DB 失败: %w", err)
	}
	defer func() {
		if err := sqlDB.Close(); err != nil {
			slog.Warn("关闭 MySQL 连接池失败", "err", err)
		}
	}()
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 指标注册：连接池指标挂在 sqlDB 就绪之后，暴露 open/idle/in_use/wait
	metricsReg := metrics.New(metrics.Config{Enabled: cfg.Metrics.Enabled})
	if dbName, err := mysql.ParseDSN(cfg.MySQL.DSN); err == nil {
		if err := metricsReg.RegisterDBStats(sqlDB, dbName.DBName); err != nil {
			// 连接池指标失败不该阻断启动——HTTP 指标仍可用
			slog.Warn("注册连接池指标失败", "err", err)
		}
	}

	repo := repository.New(db)

	// 迁移模式：建表后退出，只需 MySQL 在线
	if migrate {
		return migrateAll(repo, db, cfg)
	}

	// release 模式禁止弱 JWT secret：secret 一旦泄露即可离线伪造任意角色的 token
	if cfg.Server.Mode == gin.ReleaseMode &&
		(len(cfg.JWT.Secret) < 32 || cfg.JWT.Secret == "change-me-in-production") {
		return errors.New("生产环境必须通过 BLOG_JWT_SECRET 设置至少 32 位的强随机 JWT secret")
	}

	// Redis 埋点：仅在启用追踪时挂钩子，关闭时保持零额外开销
	var redisOpts []redis.Option
	if tracer.Enabled() {
		redisOpts = append(redisOpts, redis.WithTracerProvider(tracer.TracerProvider()))
	}
	rdb, err := redis.New(cfg.Redis.Addr, cfg.Redis.Password, cfg.Redis.DB, redisOpts...)
	if err != nil {
		return fmt.Errorf("连接 Redis 失败: %w", err)
	}
	defer func() {
		if err := rdb.Close(); err != nil {
			slog.Warn("关闭 Redis 失败", "err", err)
		}
	}()

	mc, err := rustfs.New(cfg.RustFS.Endpoint, cfg.RustFS.AccessKey, cfg.RustFS.SecretKey, cfg.RustFS.UseSSL, cfg.RustFS.Bucket)
	if err != nil {
		return fmt.Errorf("连接 RustFS 失败: %w", err)
	}

	// OAuth providers：client_id 为空的平台跳过注册（未配置 = 不可用，
	// providers 列表与 :provider 白名单校验均以此为准）
	var providers []oauth.Provider
	if cfg.OAuth.GitHub.ClientID != "" {
		providers = append(providers, oauth.NewGitHub(cfg.OAuth.GitHub.ClientID, cfg.OAuth.GitHub.ClientSecret, cfg.OAuth.GitHub.RedirectURL, cfg.OAuth.GitHub.IPs))
	}
	reg := oauth.NewRegistry(providers...)

	svc := service.New(repo, rdb, mc, reg, cfg)
	h := handler.New(svc, cfg)

	r := router.New(cfg, h, metricsReg)
	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	// 生产级默认（规范 §5）：显式超时防慢客户端占用连接；上传走 multipart，读放宽到 30s
	srv := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// SIGINT/SIGTERM 触发优雅停机，停止接收新请求并等待在途请求完成
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// HTTP 服务 goroutine 可等待退出（规范 §4）：启动失败经 errC 上抛主流程
	errC := make(chan error, 1)
	go func() {
		slog.Info("blog backend listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errC <- fmt.Errorf("服务启动失败: %w", err)
		}
	}()

	select {
	case err := <-errC:
		return err
	case <-ctx.Done():
	}
	slog.Info("正在关闭服务...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Warn("服务关闭超时", "err", err)
	}
	slog.Info("服务已退出")
	return nil
}

// migrateAll 数据库迁移流程（-migrate）：schema 收敛 → 归一旧数据 → 建表 → seed 管理员
func migrateAll(repo *repository.Repository, db *gorm.DB, cfg *config.Config) error {
	// GitHub-only schema 收敛必须在 AutoMigrate 之前：删漂移列、旧唯一索引、
	// 把 provider_id 重命名为 github_id。数据不满足前置条件时中止，旧 schema 原样保留
	if err := migrateGitHubOnlySchema(db); err != nil {
		return err
	}
	// 前置归一：journey_time 自 VARCHAR 自由文本迁 DATE 列，YYYY-MM 旧值补 -01（完整日期不受影响，
	// 列变 DATE 后不再命中，幂等）；否则 ALTER 因值非法报 1292。表不存在（全新部署）时跳过
	if db.Migrator().HasTable("about_journeys") {
		if err := db.Exec(
			"UPDATE about_journeys SET journey_time = CONCAT(journey_time, '-01') " +
				"WHERE journey_time REGEXP '^[0-9]{4}-[0-9]{1,2}$'",
		).Error; err != nil {
			return fmt.Errorf("足迹日期归一失败: %w", err)
		}
	}
	if err := db.AutoMigrate(
		&model.User{},
		&model.OAuthAccount{},
		&model.Article{},
		&model.Category{},
		&model.Tag{},
		&model.Comment{},
		&model.FriendLink{},
		&model.Profile{},
		&model.Moment{},
		&model.SiteSetting{},
		&model.AboutSkill{},
		&model.AboutProject{},
		&model.AboutJourney{},
		&model.AboutContact{},
	); err != nil {
		return fmt.Errorf("数据库迁移失败: %w", err)
	}
	// AutoMigrate 之后复核：旧列确已消失、新唯一索引存在。
	// 这条检查能兜住"模型少写 column tag 又生成 git_hub_id"这类回归
	if err := verifyGitHubOnlySchema(db); err != nil {
		return err
	}
	// 幂等初始化管理员（spec §8）：按配置的 GitHub 数字 ID seed，未配置则跳过
	if err := repo.SeedAdmin(context.Background(), cfg.Admin.GitHubID); err != nil {
		return fmt.Errorf("管理员初始化失败: %w", err)
	}
	slog.Info("数据库迁移完成")
	return nil
}
