// Package metrics Prometheus 指标采集：注册表装配与 HTTP 埋点中间件。
// 设计约定：与 obs 包同构——Disabled 时 Registry 为 nil、中间件为 no-op，
// 调用方无需判空；/metrics 端点仅在启用时注册。
package metrics

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Config 指标初始化参数（由 config.Metrics 转换而来）
type Config struct {
	// Enabled 是否启用指标采集（env：BLOG_METRICS_ENABLED）
	Enabled bool
}

// Registry 持有 Prometheus 注册表；Disabled 时 reg 为 nil
type Registry struct {
	reg *prometheus.Registry
}

// New 装配注册表。启用时注册 Go runtime 与 process 指标；
// 用独立 Registry 而非 prometheus.DefaultRegisterer——避免第三方库
// （如 GORM 插件）往默认注册表塞指标导致命名冲突或意外暴露
func New(cfg Config) *Registry {
	if !cfg.Enabled {
		return &Registry{}
	}
	reg := prometheus.NewRegistry()
	reg.MustRegister(
		collectors.NewGoCollector(),                                       // goroutine 数、GC、堆内存
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}), // CPU、RSS、fd
	)
	return &Registry{reg: reg}
}

// Enabled 是否真正启用了指标采集
func (r *Registry) Enabled() bool {
	return r != nil && r.reg != nil
}

// Registerer 返回注册表（供业务指标注册）。未启用时返回 nil，调用方需判空。
func (r *Registry) Registerer() prometheus.Registerer {
	if r == nil || r.reg == nil {
		return nil
	}
	return r.reg
}

// RegisterDBStats 注册 GORM 底层连接池指标（open/idle/in_use/wait）。
// 连接池耗尽是最常见的线上故障之一，这一项几乎零成本
func (r *Registry) RegisterDBStats(db *sql.DB, dbName string) error {
	if !r.Enabled() || db == nil {
		return nil
	}
	return r.reg.Register(collectors.NewDBStatsCollector(db, dbName))
}

// Handler 返回 /metrics 端点 handler。未启用时返回 404 handler，
// 让路由注册可以无条件调用而不必判断开关
func (r *Registry) Handler() gin.HandlerFunc {
	if !r.Enabled() {
		return func(c *gin.Context) {
			c.String(http.StatusNotFound, "metrics disabled")
		}
	}
	return gin.WrapH(promhttp.HandlerFor(r.reg, promhttp.HandlerOpts{}))
}
