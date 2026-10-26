package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// FriendLinkList 友链全量列表（#F1，公开；非分页 {list} 形态，空表恒 []）
func (h *Handler) FriendLinkList(c *gin.Context) {
	list, err := h.svc.FriendLink.List(c.Request.Context())
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, gin.H{"list": list})
}

// AdminFriendLinkCreate 新增友链（#F2）
func (h *Handler) AdminFriendLinkCreate(c *gin.Context) {
	var req struct {
		Name        string `json:"name"`
		URL         string `json:"url"`
		Description string `json:"description"`
		Image       string `json:"image"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.FriendLink.Create(c.Request.Context(), req.Name, req.URL, req.Description, req.Image)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminFriendLinkUpdate 编辑友链（#F3，全量替换）
func (h *Handler) AdminFriendLinkUpdate(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var req struct {
		Name        string `json:"name"`
		URL         string `json:"url"`
		Description string `json:"description"`
		Image       string `json:"image"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.FriendLink.Update(c.Request.Context(), id, req.Name, req.URL, req.Description, req.Image)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminFriendLinkDelete 删除友链（#F4，物理删；不存在幂等成功）
func (h *Handler) AdminFriendLinkDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.FriendLink.Delete(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}
