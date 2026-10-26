package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// momentRequest #M2/#M3 请求体（同构：content 必传，images 缺省 = 无图）
type momentRequest struct {
	Content string   `json:"content"`
	Images  []string `json:"images"`
}

// MomentList C 端动态分页列表（#M1，公开）
func (h *Handler) MomentList(c *gin.Context) {
	page, pageSize, ok := parseMomentPage(c)
	if !ok {
		response.BadRequest(c, "参数错误")
		return
	}
	data, err := h.svc.Moment.List(c.Request.Context(), page, pageSize)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, data)
}

// parseMomentPage 分页 query 解析（README 全局约定）：缺省 → 0（NormalizePage 钳默认值），
// 非数字/溢出 → 400；负数解析成功后交 NormalizePage 钳为 1
func parseMomentPage(c *gin.Context) (page, pageSize int, ok bool) {
	if q := c.Query("page"); q != "" {
		v, err := strconv.Atoi(q)
		if err != nil {
			return 0, 0, false
		}
		page = v
	}
	if q := c.Query("page_size"); q != "" {
		v, err := strconv.Atoi(q)
		if err != nil {
			return 0, 0, false
		}
		pageSize = v
	}
	return page, pageSize, true
}

// AdminMomentCreate 发表动态（#M2，admin，身份由 AdminRequired 中间件保证）
func (h *Handler) AdminMomentCreate(c *gin.Context) {
	var req momentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.Moment.Create(c.Request.Context(), req.Content, req.Images)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminMomentUpdate 编辑动态（#M3，admin，PUT 全量替换）
func (h *Handler) AdminMomentUpdate(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var req momentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.Moment.Update(c.Request.Context(), id, req.Content, req.Images)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminMomentDelete 删除动态（#M4，admin，物理删除，不存在幂等成功）
func (h *Handler) AdminMomentDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.Moment.Delete(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}
