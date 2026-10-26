// Package response 统一响应结构 {code, message, data} 与 HTTP/业务码映射
package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Body 统一响应结构
type Body struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// OK 成功响应
func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Body{Code: 0, Message: "ok", Data: data})
}

// Fail 通用失败响应
func Fail(c *gin.Context, httpStatus, code int, message string) {
	c.JSON(httpStatus, Body{Code: code, Message: message})
}

// BadRequest 参数错误（400）
func BadRequest(c *gin.Context, message string) {
	Fail(c, http.StatusBadRequest, 40000, message)
}

// Unauthorized 未登录/凭证失效（401）
func Unauthorized(c *gin.Context, message string) {
	Fail(c, http.StatusUnauthorized, 40100, message)
}

// Forbidden 无权限（403）
func Forbidden(c *gin.Context, message string) {
	Fail(c, http.StatusForbidden, 40300, message)
}

// Conflict 与资源当前状态冲突（409）：重复绑定/重复创建等
func Conflict(c *gin.Context, message string) {
	Fail(c, http.StatusConflict, 40900, message)
}

// NotFound 资源不存在（404）
func NotFound(c *gin.Context, message string) {
	Fail(c, http.StatusNotFound, 40400, message)
}

// ServerError 服务端错误（500）
func ServerError(c *gin.Context, message string) {
	Fail(c, http.StatusInternalServerError, 50000, message)
}
