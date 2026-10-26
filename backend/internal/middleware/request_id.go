package middleware

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/man-mu/blog/backend/internal/pkg/logctx"
)

// CtxRequestID 存入 gin.Context 的请求 ID 键
const CtxRequestID = "request_id"

// _maxIncomingRequestID 外部传入 X-Request-Id 的最大长度，超长视为不可信改用自生成值
const _maxIncomingRequestID = 64

// RequestID 为每个请求分配 ID：优先沿用上游（网关/负载均衡）传入的 X-Request-Id 便于链路串联，
// 缺失或超长则生成 UUID；ID 回写响应头，并注入带 request_id 字段的 slog logger 到请求 context，
// 使 handler/service/recovery 的日志都自动携带同一 request_id（规范 §5 request_id 贯穿日志）
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-Id")
		if id == "" || len(id) > _maxIncomingRequestID {
			id = uuid.NewString()
		}
		c.Set(CtxRequestID, id)
		c.Writer.Header().Set("X-Request-Id", id)
		c.Request = c.Request.WithContext(
			logctx.New(c.Request.Context(), slog.Default().With("request_id", id)),
		)
		c.Next()
	}
}

// GetRequestID 读取 RequestID 注入的请求 ID
func GetRequestID(c *gin.Context) string {
	return c.GetString(CtxRequestID)
}
