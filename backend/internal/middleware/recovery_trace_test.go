package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// TestRecoveryMarksSpanError 验证 panic 被 Recovery 收敛后 span 标红并挂上异常事件，
// 保证 Jaeger 里能用「只看错误链路」筛出崩溃请求
func TestRecoveryMarksSpanError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	captureLogs(t) // panic 仍会打一条 error 日志，捕获隔离即可
	rec := newRecordingProvider(t, sdktrace.AlwaysSample())

	r := gin.New()
	// 与 router.New 保持一致：tracing 在外层，Recovery 在内层
	r.Use(_fakeSpan(otel.Tracer("test")), Recovery())
	r.GET("/boom", func(_ *gin.Context) { panic("boom") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panic 应收敛 500，得到 %d", w.Code)
	}

	spans := rec.Ended()
	if len(spans) != 1 {
		t.Fatalf("应记录 1 个 span，得到 %d", len(spans))
	}
	sp := spans[0]
	if got := sp.Status().Code; got != codes.Error {
		t.Fatalf("panic 后 span 状态应为 Error，得到 %v", got)
	}
	if got := sp.Status().Description; got != "panic recovered" {
		t.Fatalf("状态描述应为 panic recovered，得到 %q", got)
	}

	// RecordError 会追加一个 exception 事件，事件消息需体现原始 panic 值
	events := sp.Events()
	if len(events) != 1 {
		t.Fatalf("应记录 1 个异常事件，得到 %d", len(events))
	}
	var msg string
	for _, kv := range events[0].Attributes {
		if string(kv.Key) == "exception.message" {
			msg = kv.Value.AsString()
		}
	}
	if !strings.Contains(msg, "boom") {
		t.Fatalf("异常事件消息应包含 panic 值 boom，得到 %q", msg)
	}
}
