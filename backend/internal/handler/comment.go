package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/middleware"
	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// CommentList 某文章全量评论树（#C1，公开）：非分页全量形态 {list: [...]}，无 total
func (h *Handler) CommentList(c *gin.Context) {
	list, err := h.svc.Comment.List(c.Request.Context(), c.Param("slug"))
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, gin.H{"list": list})
}

// CommentCreate 发表评论/回复（#C2，user）：root_id 服务端推导，客户端不传
func (h *Handler) CommentCreate(c *gin.Context) {
	var req struct {
		Content  string `json:"content"`
		ParentID uint64 `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.Comment.Create(c.Request.Context(), c.Param("slug"), middleware.GetUserID(c), req.Content, req.ParentID)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// CommentDelete 删除评论（#C3，user 本人 / admin 任意）：归属校验在 service 内判
func (h *Handler) CommentDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.Comment.Delete(c.Request.Context(), id, middleware.GetUserID(c), middleware.GetRole(c)); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}
