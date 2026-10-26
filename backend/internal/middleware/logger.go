package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/pkg/logctx"
)

// Logger slog 结构化访问日志（替代 gin.Logger 的文本输出）：
// 记录 method/path/status/耗时/来源 IP，request_id 由 RequestID 注入的 context logger 自动携带
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		logctx.From(c.Request.Context()).LogAttrs(c.Request.Context(), slog.LevelInfo, "http request",
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
			slog.Int("status", c.Writer.Status()),
			slog.Int64("latency_ms", time.Since(start).Milliseconds()),
			slog.String("ip", c.ClientIP()),
		)
	}
}
