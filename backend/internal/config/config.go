// Package config 应用配置：struct 定义 + viper 加载（config.yaml + BLOG_ 前缀环境变量覆盖）
package config

import (
	"strings"
	"time"

	"github.com/go-viper/mapstructure/v2"
	"github.com/spf13/viper"
)

// Config 应用总配置，对应 configs/config.yaml
type Config struct {
	Server  Server
	MySQL   MySQL
	Redis   Redis
	RustFS  RustFS
	JWT     JWT
	OAuth   OAuth
	CORS    CORS
	Admin   Admin
	Obs     Obs
	Metrics Metrics
}

// Server HTTP 服务配置
type Server struct {
	Port int    // 监听端口
	Mode string // gin 运行模式（debug/release）
}

// MySQL 数据库连接配置
type MySQL struct {
	DSN string
}

// Redis 连接配置
type Redis struct {
	Addr     string
	Password string
	DB       int
}

// RustFS 对象存储配置
type RustFS struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	UseSSL    bool
	Bucket    string
}

// JWT 凭证配置
type JWT struct {
	Secret        string
	AccessExpire  time.Duration
	RefreshExpire time.Duration
	UnlockExpire  time.Duration
}

// OAuth 第三方登录总配置
type OAuth struct {
	BaseURL string
	GitHub  OAuthProvider
}

// OAuthProvider 单个 OAuth 平台的接入参数
type OAuthProvider struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	// IPs github.com 候选连接 IP（env：BLOG_OAUTH_GITHUB_IPS，逗号分隔）：
	// 国内到 github.com 的 TLS 干扰按 IP 轮换出现，登录链路按列表轮换重试；
	// 空则不轮换（本地开发）。IP 失效时重测更新即可
	IPs []string
}

// CORS 跨域白名单配置
type CORS struct {
	AllowedOrigins []string
}

// Obs 可观测性配置（OpenTelemetry 链路追踪）
// Enabled 为 false 时后端不产生任何 span，也不向 Endpoint 发起连接——
// 本地开发或未部署 Jaeger 的环境保持零开销、零依赖
type Obs struct {
	// Enabled 是否启用链路追踪导出（env：BLOG_OBS_ENABLED）
	Enabled bool
	// Endpoint OTLP gRPC 端点 host:port（env：BLOG_OBS_ENDPOINT）
	Endpoint string
	// Insecure 跳过 TLS 明文传输，仅限内网/隧道（env：BLOG_OBS_INSECURE）
	Insecure bool
	// SampleRatio 头部采样比例 0~1，1 表示全采（env：BLOG_OBS_SAMPLE_RATIO）
	SampleRatio float64
	// ServiceName 上报的服务名，Jaeger 按此聚合（env：BLOG_OBS_SERVICE_NAME）
	ServiceName string
	// Environment 部署环境标识，如 debug/release（env：BLOG_OBS_ENVIRONMENT）
	Environment string
}

// Admin 管理员初始化配置，-migrate 时 seed 用（spec §8）
type Admin struct {
	// GitHubID 管理员 GitHub 数字 ID（非用户名，避免改名失效），
	// 查询：curl https://api.github.com/users/<用户名> 取 id；env：BLOG_ADMIN_GITHUB_ID
	GitHubID uint64
}

// Metrics Prometheus 指标配置
// 与 Obs 独立开关：链路追踪推给 Jaeger（push），指标由 Prometheus 来抓（pull），
// 两者可以只开其中一个
type Metrics struct {
	// Enabled 是否启用指标采集与 /metrics 端点（env：BLOG_METRICS_ENABLED）
	Enabled bool
}

// Load 读取配置文件，支持环境变量覆盖（前缀 BLOG，点转下划线，如 BLOG_JWT_SECRET）
func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	if err := v.ReadInConfig(); err != nil {
		return nil, err
	}

	v.SetEnvPrefix("BLOG")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	cfg := &Config{}
	// mapstructure 默认匹配连不上下划线风格的键（如 access_expire → AccessExpire
	// 会静默得到零值），改为下划线无关匹配；WeaklyTypedInput 让环境变量注入的
	// 纯字符串值能转换到 int/bool 字段（如 BLOG_RUSTFS_USE_SSL=false → UseSSL）
	if err := v.Unmarshal(cfg, func(dc *mapstructure.DecoderConfig) {
		strip := func(s string) string { return strings.ReplaceAll(s, "_", "") }
		dc.MatchName = func(mapKey, fieldName string) bool {
			return strings.EqualFold(strip(mapKey), strip(fieldName))
		}
		dc.WeaklyTypedInput = true
	}); err != nil {
		return nil, err
	}
	return cfg, nil
}
