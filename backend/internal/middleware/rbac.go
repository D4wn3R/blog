package middleware

import (
	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/model"
	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// AdminRequired 在 AuthRequired 之后使用，校验管理员角色
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		if GetRole(c) != model.RoleAdmin {
			response.Forbidden(c, "无权限")
			c.Abort()
			return
		}
		c.Next()
	}
}
