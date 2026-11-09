package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

// 指标埋点的核心风险是标签基数与探针噪声，这里逐条钉住

func newTestRegistry(t *testing.T) *Registry {
	t.Helper()
	reg := New(Config{Enabled: true})
	if !reg.Enabled() {
		t.Fatal("Enabled=true 时应装配注册表")
	}
	return reg
}

func TestHTTPMetricsDisabledIsNoop(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reg := New(Config{Enabled: false})
	m, mw := NewHTTPMetrics(reg)

	if m.Enabled() {
		t.Fatal("未启用时中间件不应采集")
	}
	r := gin.New()
	r.Use(mw)
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("no-op 中间件不应影响响应，得到 %d", w.Code)
	}
}

func TestHTTPMetricsRouteUsesTemplatePath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reg := newTestRegistry(t)
	_, mw := NewHTTPMetrics(reg)

	r := gin.New()
	r.Use(mw)
	r.GET("/api/articles/:slug", func(c *gin.Context) { c.Status(http.StatusOK) })

	// 打 3 个不同的 slug：若标签用真实路径会产生 3 条序列，用模板则只有 1 条
	for _, slug := range []string{"hello-world", "second-post", "third-post"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/articles/"+slug, nil))
	}

	count, err := testutil.GatherAndCount(reg.reg, "blog_http_requests_total")
	if err != nil {
		t.Fatalf("采集指标失败: %v", err)
	}
	if count != 1 {
		t.Fatalf("三个不同 slug 应聚合成 1 条序列（模板路径），实际 %d 条——标签用了真实路径", count)
	}
}

func TestHTTPMetricsSeparatesStatusCodes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reg := newTestRegistry(t)
	_, mw := NewHTTPMetrics(reg)

	r := gin.New()
	r.Use(mw)
	r.GET("/ok", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.GET("/bad", func(c *gin.Context) { c.Status(http.StatusBadRequest) })

	for _, path := range []string{"/ok", "/ok", "/bad"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	}

	// 200 与 400 是两个不同标签组合，各自一条序列
	count, err := testutil.GatherAndCount(reg.reg, "blog_http_requests_total")
	if err != nil {
		t.Fatalf("采集指标失败: %v", err)
	}
	if count != 2 {
		t.Fatalf("200 与 400 应各占 1 条序列，实际 %d 条", count)
	}
}

func TestHTTPMetricsSkipsProbes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reg := newTestRegistry(t)
	_, mw := NewHTTPMetrics(reg)

	r := gin.New()
	r.Use(mw)
	r.GET("/api/health", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.GET("/healthz", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.GET("/readyz", func(c *gin.Context) { c.Status(http.StatusOK) })

	for _, path := range []string{"/api/health", "/healthz", "/readyz"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	}

	// 探针全部跳过 → 该指标一条序列都不该有
	count, err := testutil.GatherAndCount(reg.reg, "blog_http_requests_total")
	if err != nil {
		t.Fatalf("采集指标失败: %v", err)
	}
	if count != 0 {
		t.Fatalf("探针不应计入指标，实际产生 %d 条序列", count)
	}
}

func TestHTTPMetricsUnmatchedRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reg := newTestRegistry(t)
	_, mw := NewHTTPMetrics(reg)

	r := gin.New()
	r.Use(mw)
	r.NoRoute(func(c *gin.Context) { c.Status(http.StatusNotFound) })

	// 两个不同的 404 路径：FullPath() 返回空串，应兜底成 unmatched 合成一条
	for _, path := range []string{"/nope", "/also-nope"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	}

	count, err := testutil.GatherAndCount(reg.reg, "blog_http_requests_total")
	if err != nil {
		t.Fatalf("采集指标失败: %v", err)
	}
	if count != 1 {
		t.Fatalf("未匹配路由应兜底为 unmatched 合成 1 条序列，实际 %d 条", count)
	}
}

func TestHandlerDisabledReturns404(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reg := New(Config{Enabled: false})

	r := gin.New()
	r.GET("/metrics", reg.Handler())

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("未启用指标时 /metrics 应返回 404，得到 %d", w.Code)
	}
}

func TestHandlerExposesGoRuntime(t *testing.T) {
	gin.SetMode(gin.TestMode)
	reg := newTestRegistry(t)

	r := gin.New()
	r.GET("/metrics", reg.Handler())

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("/metrics 应返回 200，得到 %d", w.Code)
	}
	// goroutine 数是排查泄漏的第一指标，必须在暴露列表里
	body := w.Body.String()
	if !strings.Contains(body, "go_goroutines") || !strings.Contains(body, "process_cpu_seconds_total") {
		t.Fatalf("应暴露 Go runtime 与 process 指标，实际输出前 200 字节: %.200s", body)
	}
}
