// Package handler HTTP 层：绑定/校验参数 → 调 service → 统一响应封装
package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/config"
	"github.com/man-mu/blog/backend/internal/pkg/logctx"
	"github.com/man-mu/blog/backend/internal/pkg/response"
	"github.com/man-mu/blog/backend/internal/service"
)

// Handler HTTP 层，仅做参数绑定/校验与响应封装
type Handler struct {
	svc *service.Service
	cfg *config.Config
}

// New 组装 HTTP 层，svc 为唯一业务入口
func New(svc *service.Service, cfg *config.Config) *Handler {
	return &Handler{svc: svc, cfg: cfg}
}

// Health 存活探针（/healthz 与 /api/health 共用）：进程在即 200
func (h *Handler) Health(c *gin.Context) {
	response.OK(c, gin.H{"status": "ok"})
}

// Ready 就绪探针（/readyz）：MySQL 与 Redis 连通性检查，依赖未就绪 500
func (h *Handler) Ready(c *gin.Context) {
	if err := h.svc.Ready(c.Request.Context()); err != nil {
		loggerFrom(c).Warn("readiness check failed", "err", err)
		response.Fail(c, 500, 50000, "服务未就绪")
		return
	}
	response.OK(c, gin.H{"status": "ok"})
}

// fail 统一错误映射：Error 按携带的状态码/业务码响应，5xx 额外记录根因日志
// （request_id 贯穿，根因文本由 Error.Error() 附带）；未知错误收敛 50000 并记日志
func (h *Handler) fail(c *gin.Context, err error) {
	var se *service.Error
	if errors.As(err, &se) {
		if se.HTTPStatus >= http.StatusInternalServerError {
			loggerFrom(c).Error("internal error",
				"method", c.Request.Method,
				"path", c.Request.URL.Path,
				"err", err,
			)
		}
		response.Fail(c, se.HTTPStatus, se.Code, se.Message)
		return
	}
	loggerFrom(c).Error("unhandled error",
		"method", c.Request.Method,
		"path", c.Request.URL.Path,
		"err", err,
	)
	response.ServerError(c, "服务异常，请稍后重试")
}

// loggerFrom 取请求 context 上的 slog logger（RequestID 中间件注入，自带 request_id）
func loggerFrom(c *gin.Context) *slog.Logger {
	return logctx.From(c.Request.Context())
}
