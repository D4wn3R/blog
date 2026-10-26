package handler

import (
	"net/http"
	"net/url"
	"runtime/debug"
	"slices"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/middleware"
	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// ---------- OAuth 登录/绑定（#1~#4） ----------

// OAuthProviders 可用登录方式列表（#1）：只含已配置（client_id 非空）的平台
func (h *Handler) OAuthProviders(c *gin.Context) {
	names := h.svc.Reg.Names()
	slices.Sort(names) // Registry 遍历 map 顺序随机，排序保证输出稳定
	response.OK(c, gin.H{"providers": names})
}

// OAuthAuthorize 登录跳转（#2）：302 平台授权页
func (h *Handler) OAuthAuthorize(c *gin.Context) {
	authorizeURL, err := h.svc.OAuth.Authorize(c.Request.Context(), c.Param("provider"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.Redirect(http.StatusFound, authorizeURL)
}

// OAuthCallback 回调处理（#3）：任何路径都必须 302 回前端，绝不返回 JSON（spec 总则 3 / §7.5）。
// defer 兜底 panic 也收敛为 302 error=oauth_failed，错误分派在 service.Callback 内完成
func (h *Handler) OAuthCallback(c *gin.Context) {
	defer func() {
		if r := recover(); r != nil {
			// recover 先于全局 Recovery 生效，必须自带堆栈，否则 callback panic 无法定位
			loggerFrom(c).Error("oauth callback panic", "panic", r, "stack", string(debug.Stack()))
			h.redirectCallback(c, url.Values{"error": {"oauth_failed"}})
		}
	}()
	q := h.svc.OAuth.Callback(c.Request.Context(), c.Param("provider"), c.Query("error"), c.Query("code"), c.Query("state"))
	h.redirectCallback(c, q)
}

// redirectCallback 统一 302 出口：{base_url}/oauth/callback?{query}
func (h *Handler) redirectCallback(c *gin.Context, q url.Values) {
	target := h.cfg.OAuth.BaseURL + "/oauth/callback"
	if encoded := q.Encode(); encoded != "" {
		target += "?" + encoded
	}
	c.Redirect(http.StatusFound, target)
}

// OAuthBindState 绑定跳转（#4，两段式）：fetch 携带 Bearer 换 authorize_url，前端立即 location.href
func (h *Handler) OAuthBindState(c *gin.Context) {
	authorizeURL, err := h.svc.OAuth.BindState(c.Request.Context(), middleware.GetUserID(c), c.Param("provider"))
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, gin.H{"authorize_url": authorizeURL})
}

// ---------- 凭证（#5~#7） ----------

// AuthExchange auth_code 换凭证对（#5）
func (h *Handler) AuthExchange(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	pair, err := h.svc.Auth.Exchange(c.Request.Context(), req.Code)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, pair)
}

// AuthRefresh refresh 轮换（#6）
func (h *Handler) AuthRefresh(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	pair, err := h.svc.Auth.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, pair)
}

// AuthLogout 登出（#7）：尽力而为，前端失败也继续本地清理
func (h *Handler) AuthLogout(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	if err := h.svc.Auth.Logout(c.Request.Context(), middleware.GetUserID(c), req.RefreshToken); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// ---------- 当前用户（#8/#9） ----------

// UserMe 当前用户 + 绑定列表（#8）
func (h *Handler) UserMe(c *gin.Context) {
	me, err := h.svc.User.Me(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, me)
}

// UserUnbindOAuth 解绑（#9）
func (h *Handler) UserUnbindOAuth(c *gin.Context) {
	if err := h.svc.User.Unbind(c.Request.Context(), middleware.GetUserID(c), c.Param("provider")); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}
