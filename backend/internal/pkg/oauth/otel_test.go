package oauth

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

// setupTestTracer 注入全局 TracerProvider 并返回 span 记录器。
// 全局 provider 属于进程级状态，测试结束必须恢复，否则污染同包其他测试。
func setupTestTracer(t *testing.T) *tracetest.SpanRecorder {
	t.Helper()
	sr := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithSpanProcessor(sr),
	)
	prev := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)
	t.Cleanup(func() {
		otel.SetTracerProvider(prev)
		if err := tp.Shutdown(context.Background()); err != nil {
			t.Errorf("shutdown tracer provider: %v", err)
		}
	})
	return sr
}

// hasAttr 判断 span 属性里是否存在指定键值对
func hasAttr(kvs []attribute.KeyValue, key, want string) bool {
	for _, kv := range kvs {
		if string(kv.Key) == key && kv.Value.AsString() == want {
			return true
		}
	}
	return false
}

// TestOutboundHTTPTraced 锁定出站埋点：ips 为空的共享客户端也必须产生 client span，
// 且 span 名带 host——否则 Jaeger 里只会看到一堆同名的 "HTTP GET"
func TestOutboundHTTPTraced(t *testing.T) {
	sr := setupTestTracer(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	resp, err := githubClient(nil).Get(srv.URL)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()

	spans := sr.Ended()
	if len(spans) != 1 {
		t.Fatalf("spans = %d, want 1", len(spans))
	}
	span := spans[0]
	host := strings.TrimPrefix(srv.URL, "http://")
	if got, want := span.Name(), "GET "+host; got != want {
		t.Errorf("span name = %q, want %q", got, want)
	}
	if span.SpanKind() != trace.SpanKindClient {
		t.Errorf("span kind = %v, want client", span.SpanKind())
	}
	if !hasAttr(span.Attributes(), "http.request.method", http.MethodGet) {
		t.Errorf("http.request.method=GET missing in %v", span.Attributes())
	}
}

// TestOutboundSpanPerRetry 锁定「埋点包在 retryTransport.base 层」的决策：
// 首次连接被掐断 + 重试成功 = 2 个 span，排查 IP 干扰时才能看出卡在第几次尝试；
// 若包在整条链路最外层，这里只会剩 1 个合并后的大 span
func TestOutboundSpanPerRetry(t *testing.T) {
	sr := setupTestTracer(t)
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		if hits > 1 {
			w.WriteHeader(http.StatusOK)
			return
		}
		// 直接掐断连接模拟传输层干扰：客户端拿到 EOF，retryTransport 触发重试
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Errorf("response writer does not support hijack")
			return
		}
		conn, _, err := hj.Hijack()
		if err != nil {
			t.Errorf("hijack: %v", err)
			return
		}
		_ = conn.Close()
	}))
	defer srv.Close()

	resp, err := githubClient(nil).Get(srv.URL)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()

	if hits != 2 {
		t.Fatalf("hits = %d, want 2", hits)
	}
	spans := sr.Ended()
	if len(spans) != 2 {
		t.Fatalf("spans = %d, want 2 (one per retry attempt)", len(spans))
	}
	for i, span := range spans {
		if !hasAttr(span.Attributes(), "http.request.method", http.MethodGet) {
			t.Errorf("span[%d] missing http.request.method=GET", i)
		}
	}
}
