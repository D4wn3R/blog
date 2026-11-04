package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"

	"github.com/D4wn3R/blog/backend/internal/pkg/logctx"
)

// RequestID 的链路关联单测：验证 request_id ↔ trace_id 双向可查，
// 以及未采样、追踪未启用两种降级路径不会写入查不到的死链接

// _fakeSpan 模拟 otelgin：为请求起一个 server span 并写回 request context
func _fakeSpan(tracer trace.Tracer) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, span := tracer.Start(c.Request.Context(), "test-span")
		defer span.End() //nolint:revive // span 生命周期必须覆盖整个请求链
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

// newRecordingProvider 装配把 span 收进内存的 TracerProvider，返回 recorder 供断言；
// 采样结论由 sampler 决定。测试结束恢复全局 provider 与 propagator
func newRecordingProvider(t *testing.T, sampler sdktrace.Sampler) *tracetest.SpanRecorder {
	t.Helper()
	rec := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSpanProcessor(rec),
		sdktrace.WithSampler(sampler),
	)
	prevTP := otel.GetTracerProvider()
	prevProp := otel.GetTextMapPropagator()
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	t.Cleanup(func() {
		_ = tp.Shutdown(context.Background())
		otel.SetTracerProvider(prevTP)
		otel.SetTextMapPropagator(prevProp)
	})
	return rec
}

// captureLogs 把默认 slog logger 换成写入 buf 的 JSON handler，测试结束恢复
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

// singleLogEntry 解析唯一一条日志记录
func singleLogEntry(t *testing.T, buf *bytes.Buffer) map[string]any {
	t.Helper()
	var entry map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &entry); err != nil {
		t.Fatalf("日志应为单行 JSON: %v（原始内容 %q）", err, buf.String())
	}
	return entry
}

// spanAttr 读取 span 上的字符串属性，不存在返回空串
func spanAttr(s sdktrace.ReadOnlySpan, key string) string {
	for _, kv := range s.Attributes() {
		if string(kv.Key) == key {
			return kv.Value.AsString()
		}
	}
	return ""
}

func TestRequestIDLinksTraceWhenSampled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	buf := captureLogs(t)
	rec := newRecordingProvider(t, sdktrace.AlwaysSample())

	r := gin.New()
	r.Use(_fakeSpan(otel.Tracer("test")), RequestID())
	r.GET("/ping", func(c *gin.Context) {
		logctx.From(c.Request.Context()).Info("ping")
		c.String(http.StatusOK, GetRequestID(c))
	})

	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	req.Header.Set("X-Request-Id", "rid-fixed")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	spans := rec.Ended()
	if len(spans) != 1 {
		t.Fatalf("采样时应记录 1 个 span，得到 %d", len(spans))
	}
	wantTraceID := spans[0].SpanContext().TraceID().String()

	entry := singleLogEntry(t, buf)
	if got := entry["request_id"]; got != "rid-fixed" {
		t.Fatalf("日志应携带 request_id=rid-fixed，得到 %v", got)
	}
	// 日志 → Jaeger：日志里的 trace_id 必须等于真实 span 的 trace_id
	if got := entry["trace_id"]; got != wantTraceID {
		t.Fatalf("日志 trace_id 应为 %s，得到 %v", wantTraceID, got)
	}
	// Jaeger → 日志：span 上必须挂得住 request_id
	if got := spanAttr(spans[0], "request_id"); got != "rid-fixed" {
		t.Fatalf("span 应携带 request_id=rid-fixed，得到 %q", got)
	}
}

func TestRequestIDSkipsTraceIDWhenNotSampled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	buf := captureLogs(t)
	rec := newRecordingProvider(t, sdktrace.NeverSample())

	r := gin.New()
	r.Use(_fakeSpan(otel.Tracer("test")), RequestID())
	r.GET("/ping", func(c *gin.Context) {
		logctx.From(c.Request.Context()).Info("ping")
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ping", nil))

	if spans := rec.Ended(); len(spans) != 0 {
		t.Fatalf("未采样不应记录 span，得到 %d", len(spans))
	}
	entry := singleLogEntry(t, buf)
	if _, ok := entry["trace_id"]; ok {
		t.Fatal("未采样时不应写入 trace_id——它不会进 Jaeger，只会得到查不到的死链接")
	}
	if entry["request_id"] == nil || entry["request_id"] == "" {
		t.Fatal("未采样时 request_id 仍须照常写入")
	}
}

func TestRequestIDWithoutSpan(t *testing.T) {
	gin.SetMode(gin.TestMode)
	buf := captureLogs(t)

	// 不挂任何 tracing 中间件：模拟 obs.enabled=false
	r := gin.New()
	r.Use(RequestID())
	r.GET("/ping", func(c *gin.Context) {
		logctx.From(c.Request.Context()).Info("ping")
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ping", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("无 span 时中间件不应影响响应，得到 %d", w.Code)
	}
	entry := singleLogEntry(t, buf)
	if _, ok := entry["trace_id"]; ok {
		t.Fatal("追踪未启用时不应写入 trace_id")
	}
	if entry["request_id"] == nil || entry["request_id"] == "" {
		t.Fatal("追踪未启用时 request_id 仍须照常写入")
	}
}

// TestRequestIDInsideOtelginSpan 用真实 otelgin 验证注册顺序：
// otelgin 必须在外层，RequestID 才能读到已建立的 span
func TestRequestIDInsideOtelginSpan(t *testing.T) {
	gin.SetMode(gin.TestMode)
	buf := captureLogs(t)
	rec := newRecordingProvider(t, sdktrace.AlwaysSample())

	r := gin.New()
	// 与 router.New 中的顺序保持一致
	r.Use(otelgin.Middleware("blog-backend"))
	r.Use(RequestID())
	r.GET("/api/demo/:slug", func(c *gin.Context) {
		logctx.From(c.Request.Context()).Info("demo")
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/demo/hello", nil))

	spans := rec.Ended()
	if len(spans) != 1 {
		t.Fatalf("otelgin 应记录 1 个 span，得到 %d", len(spans))
	}
	// otelgin 用 c.FullPath() 命名，高频量路由不会把标签基数撑爆
	if got, want := spans[0].Name(), "GET /api/demo/:slug"; got != want {
		t.Fatalf("span 名应为模板路径 %q，得到 %q", want, got)
	}
	entry := singleLogEntry(t, buf)
	if got := entry["trace_id"]; got != spans[0].SpanContext().TraceID().String() {
		t.Fatalf("真实 otelgin 下日志 trace_id 应与 span 一致，得到 %v", got)
	}
	if got := spanAttr(spans[0], "request_id"); got == "" {
		t.Fatal("真实 otelgin 下 span 应携带 request_id 属性")
	}
}
