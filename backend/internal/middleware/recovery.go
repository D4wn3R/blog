package middleware

import (
	"runtime/debug"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/pkg/logctx"
	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// Recovery 捕获 panic，返回统一 JSON 错误并经 slog 记录堆栈（携带 request_id）
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
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
