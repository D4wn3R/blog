package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
)

// _untrackedPaths 不计入指标的路由：探针每 5 秒一次、/metrics 被 Prometheus
// 高频抓取，计入会稀释真实业务数字。与 router 的链路过滤保持同一份口径
var _untrackedPaths = map[string]struct{}{
	"/healthz":    {},
	"/readyz":     {},
	"/api/health": {},
	"/metrics":    {},
}

// HTTPMetrics 持有 HTTP 层指标
type HTTPMetrics struct {
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
	// errors 只统计服务端错误（status >= 500）。单独成指标是为了告警规则能
	// 直接写 blog_http_errors_total，不必对 requests_total 用 status=~"5.."
	// 正则筛选；4xx 属于客户端问题（参数错、未登录、路由不存在），不纳入
	// 错误口径，否则告警会被正常业务噪声刷响
	errors   *prometheus.CounterVec
	inFlight prometheus.Gauge
	enabled  bool
}

// NewHTTPMetrics 注册 HTTP 指标并返回中间件。未启用时返回 no-op 中间件。
//
// 标签只用 route（模板路径）而非真实路径：c.FullPath() 返回 /api/articles/:slug
// 这种模板，几百篇文章只产生一条时间序列；用 URL.Path 则每篇文章都是一条新
// 序列，会把 Prometheus 内存和磁盘撑爆——这是指标埋点最常见的翻车点。
func NewHTTPMetrics(reg *Registry) (*HTTPMetrics, gin.HandlerFunc) {
	if !reg.Enabled() {
		return &HTTPMetrics{}, func(c *gin.Context) { c.Next() }
	}

	m := &HTTPMetrics{
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "blog",
			Subsystem: "http",
			Name:      "requests_total",
			Help:      "HTTP 请求总数，按方法/路由/状态码分类",
		}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "blog",
			Subsystem: "http",
			Name:      "request_duration_seconds",
			Help:      "HTTP 请求耗时（秒）",
			// 分桶覆盖 Web 接口的典型区间：5ms~10s。默认桶（.005~10）粒度
			// 在毫秒级接口上太粗，P99 会落到一个巨大的桶里失去意义
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		}, []string{"method", "route"}),
		inFlight: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "blog",
			Subsystem: "http",
			Name:      "requests_in_flight",
			Help:      "当前正在处理的请求数",
		}),
		errors: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "blog",
			Subsystem: "http",
			Name:      "errors_total",
			Help:      "HTTP 服务端错误（5xx）总数，按路由/状态码分类",
		}, []string{"route", "status"}),
		enabled: true,
	}

	reg.reg.MustRegister(m.requests, m.duration, m.inFlight, m.errors)

	return m, func(c *gin.Context) {
		if _, skip := _untrackedPaths[c.Request.URL.Path]; skip {
			c.Next()
			return
		}

		m.inFlight.Inc()
		defer m.inFlight.Dec()

		start := time.Now()
		c.Next()

		// c.FullPath() 在路由未匹配时返回空串（走 NoRoute），兜底成 "unmatched"，
		// 否则所有 404 会挤在一条空标签的序列上，看起来像正常流量
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		method := c.Request.Method
		statusCode := c.Writer.Status()
		status := strconv.Itoa(statusCode)

		m.requests.WithLabelValues(method, route, status).Inc()
		m.duration.WithLabelValues(method, route).Observe(time.Since(start).Seconds())

		// 只有 5xx 计入错误计数器；探针已在函数开头跳过，此处无需重复判断
		if statusCode >= http.StatusInternalServerError {
			m.errors.WithLabelValues(route, status).Inc()
		}
	}
}

// Enabled 是否真正在采集
func (m *HTTPMetrics) Enabled() bool {
	return m != nil && m.enabled
}
