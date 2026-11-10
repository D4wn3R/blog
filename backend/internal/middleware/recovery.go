package middleware

import (
	"fmt"
	"runtime/debug"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/D4wn3R/blog/backend/internal/pkg/logctx"
	"github.com/D4wn3R/blog/backend/internal/pkg/response"
)

// Recovery 捕获 panic，返回统一 JSON 错误并经 slog 记录堆栈（携带 request_id）
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// 把 panic 写进链路状态，否则 Jaeger 里这条链路仍是绿色正常态，
				// 无法按「只看错误链路」筛出崩溃请求。
				// 追踪未启用时 SpanFromContext 返回 no-op span，以下调用都是空操作，无需额外判断
				span := trace.SpanFromContext(c.Request.Context())
				span.RecordError(fmt.Errorf("panic: %v", err))
				span.SetStatus(codes.Error, "panic recovered")

				logctx.From(c.Request.Context()).Error("panic recovered",
					"panic", err,
					"stack", string(debug.Stack()),
				)
				response.ServerError(c, "服务器内部错误")
				c.Abort()
			}
		}()
		c.Next()
	}
}
