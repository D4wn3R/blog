package middleware

import (
	"runtime/debug"

	"github.com/gin-gonic/gin"

	"github.com/D4wn3R/blog/backend/internal/pkg/logctx"
	"github.com/D4wn3R/blog/backend/internal/pkg/response"
)

// Recovery 捕获 panic，返回统一 JSON 错误并经 slog 记录堆栈（携带 request_id）
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// TODO(obs): panic 未写入链路状态——此处应调 span.RecordError + SetStatus(codes.Error)，
				// 否则发生 panic 的请求在 Jaeger 里显示为绿色正常链路，无法用「只看错误链路」筛出来
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
