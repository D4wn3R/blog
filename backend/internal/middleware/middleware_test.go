package middleware

// RequestID/Recovery/Logger 中间件单测（规范 §2.5：handler 测试用 httptest，不起真实端口）

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/pkg/response"
)

func TestRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID())
	r.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, GetRequestID(c))
	})

	// 未传头：生成 UUID 并回写响应头
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ping", nil))
	if id := w.Body.String(); len(id) != 36 {
		t.Fatalf("应生成 36 位 UUID request_id，得到 %q", id)
	}
	if w.Header().Get("X-Request-Id") == "" {
		t.Fatal("应回写 X-Request-Id 响应头")
	}

	// 传入头：沿用上游值便于链路串联
	w = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	req.Header.Set("X-Request-Id", "trace-123")
	r.ServeHTTP(w, req)
	if got := w.Body.String(); got != "trace-123" {
		t.Fatalf("应沿用传入 request_id，得到 %q", got)
	}

	// 超长传入：视为不可信改用自生成
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/ping", nil)
	req.Header.Set("X-Request-Id", strings.Repeat("x", _maxIncomingRequestID+1))
	r.ServeHTTP(w, req)
	if got := w.Body.String(); len(got) != 36 {
		t.Fatalf("超长传入应改用自生成 UUID，得到 %q", got)
	}
}

func TestRecovery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID(), Recovery())
	r.GET("/boom", func(_ *gin.Context) { panic("boom") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panic 应收敛 500，得到 %d", w.Code)
	}
	var body response.Body
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Code != 50000 {
		t.Fatalf("panic 应返回统一 JSON 50000: %s", w.Body.String())
	}
}

func TestLogger(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID(), Logger())
	r.GET("/ok", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ok", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("访问日志中间件不应影响响应，得到 %d", w.Code)
	}
}
