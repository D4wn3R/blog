// Package middleware gin 中间件：request_id、访问日志、recovery、CORS、鉴权与 RBAC
package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	appjwt "github.com/man-mu/blog/backend/internal/pkg/jwt"
	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// 存入 gin.Context 的键
const (
	CtxUserID   = "uid"
	CtxUserRole = "role"
)

// AuthRequired 解析 Bearer access token，注入当前用户
func AuthRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			response.Unauthorized(c, "未登录")
			c.Abort()
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims, err := appjwt.Parse(secret, tokenStr)
		if err != nil {
			response.Unauthorized(c, "登录已过期，请重新登录")
			c.Abort()
			return
		}
		if claims.UserID == 0 {
			response.Unauthorized(c, "无效凭证")
			c.Abort()
			return
		}
		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxUserRole, claims.Role)
		c.Next()
	}
}

// GetUserID 读取 AuthRequired 注入的用户 ID
func GetUserID(c *gin.Context) uint64 {
	v, _ := c.Get(CtxUserID)
	uid, _ := v.(uint64)
	return uid
}

// GetRole 读取 AuthRequired 注入的角色
func GetRole(c *gin.Context) string {
	v, _ := c.Get(CtxUserRole)
	role, _ := v.(string)
	return role
}
