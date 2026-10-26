package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// FeedGet RSS 订阅源（/feed.xml，RSS 2.0）
// 挂站点根路径而非 /api 下（阅读器直接订阅域名/feed.xml），nginx 需精准转发
func (h *Handler) FeedGet(c *gin.Context) {
	data, err := h.svc.Feed.Generate(c.Request.Context())
	if err != nil {
		h.fail(c, err)
		return
	}
	c.Data(http.StatusOK, "application/rss+xml; charset=utf-8", data)
}
