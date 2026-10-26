// Package router 路由注册：公开 API、登录态 API 与管理 API 三段分组
package router

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/config"
	"github.com/man-mu/blog/backend/internal/handler"
	"github.com/man-mu/blog/backend/internal/middleware"
	"github.com/man-mu/blog/backend/internal/pkg/response"
)

// New 构建路由
// 路由分三段：
//
//	公开 API → 文章/分类/标签/归档/动态/友链/关于/评论查看、OAuth 登录
//	用户 API → 需登录（AuthRequired）：发表评论、删自己评论、绑定 OAuth
//	管理 API → 需管理员（AuthRequired + AdminRequired）：文章/动态/友链/关于/上传 CRUD
func New(cfg *config.Config, h *handler.Handler) *gin.Engine {
	r := gin.New()
	// 顺序：RequestID 最先（后续日志/恢复均携带 request_id）→ Recovery → 访问日志 → CORS
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery())
	r.Use(middleware.Logger())
	r.Use(middleware.CORS(cfg.CORS.AllowedOrigins))

	// 探针（规范 §5：/healthz 存活 + /readyz 就绪，供负载均衡/容器编排；/api/health 为历史契约保留）
	r.GET("/healthz", h.Health)
	r.GET("/readyz", h.Ready)

	// 未匹配路由统一 JSON 兜底（docs/API/README.md：code 40400）
	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, response.Body{Code: 40400, Message: "资源不存在或路径错误"})
	})

	// RSS 订阅源（站点根路径，阅读器习惯直接订阅域名/feed.xml；nginx 精准转发）
	r.GET("/feed.xml", h.FeedGet)

	api := r.Group("/api")
	{
		api.GET("/health", h.Health)

		// 认证/OAuth 公开组（spec #1/#2/#3/#5/#6，不加鉴权中间件）
		pub := api.Group("")
		{
			pub.GET("/oauth/providers", h.OAuthProviders)
			pub.GET("/oauth/:provider/authorize", h.OAuthAuthorize)
			pub.GET("/oauth/:provider/callback", h.OAuthCallback)
			pub.POST("/auth/exchange", h.AuthExchange)
			pub.POST("/auth/refresh", h.AuthRefresh)

			// 文章域（#A1/#A2/#A3/#A9/#A12/#A15）与评论查看（#C1）
			// 注意：文章域路径参数统一 :slug（gin 路由树同位置参数名不一致启动即 panic）
			pub.GET("/articles", h.ArticleList)
			pub.GET("/articles/:slug", h.ArticleDetail)
			pub.POST("/articles/:slug/unlock", h.ArticleUnlock)
			pub.GET("/articles/:slug/comments", h.CommentList)
			pub.GET("/categories", h.CategoryList)
			pub.GET("/tags", h.TagList)
			pub.GET("/archive", h.ArchiveGet)

			// 动态/友链/关于（#M1/#F1/#B1）
			pub.GET("/moments", h.MomentList)
			pub.GET("/friend-links", h.FriendLinkList)
			pub.GET("/about", h.AboutGet)
		}

		// 认证/OAuth 需登录组（spec #4/#7/#8/#9）
		// 注意：#4 bind-state 需登录，不能按序号区间划进公开组，否则 GetUserID 恒为 0，
		// 绑定流程会被 callback 当成登录流程执行（spec §7.11）
		authed := api.Group("")
		authed.Use(middleware.AuthRequired(cfg.JWT.Secret))
		{
			authed.POST("/oauth/:provider/bind-state", h.OAuthBindState)
			authed.POST("/auth/logout", h.AuthLogout)
			authed.GET("/user/me", h.UserMe)
			authed.DELETE("/user/oauth/:provider", h.UserUnbindOAuth)

			// 评论发表/删除（#C2/#C3，归属校验在 service）
			authed.POST("/articles/:slug/comments", h.CommentCreate)
			authed.DELETE("/comments/:id", h.CommentDelete)
		}

		// 管理 API：文章/分类/标签（#A4~#A8/#A10/#A11/#A13/#A14）、
		// 动态/友链/关于/站点设置（#M2~#M4/#F2~#F4/#B2~#B18）、上传 presign（#U1）
		admin := api.Group("/admin")
		admin.Use(middleware.AuthRequired(cfg.JWT.Secret), middleware.AdminRequired())
		{
			admin.GET("/articles", h.AdminArticleList)
			admin.GET("/articles/:id", h.AdminArticleGet)
			admin.POST("/articles", h.AdminArticleCreate)
			admin.PUT("/articles/:id", h.AdminArticleUpdate)
			admin.DELETE("/articles/:id", h.AdminArticleDelete)

			admin.POST("/categories", h.AdminCategoryCreate)
			admin.DELETE("/categories/:id", h.AdminCategoryDelete)
			admin.POST("/tags", h.AdminTagCreate)
			admin.DELETE("/tags/:id", h.AdminTagDelete)

			admin.POST("/moments", h.AdminMomentCreate)
			admin.PUT("/moments/:id", h.AdminMomentUpdate)
			admin.DELETE("/moments/:id", h.AdminMomentDelete)

			admin.POST("/friend-links", h.AdminFriendLinkCreate)
			admin.PUT("/friend-links/:id", h.AdminFriendLinkUpdate)
			admin.DELETE("/friend-links/:id", h.AdminFriendLinkDelete)

			// 关于页管理（skills/projects/journeys 的静态段 sort 与参数段 :id 并存，gin 静态优先）
			admin.PUT("/about/profile", h.AdminAboutProfileUpdate)
			admin.POST("/about/skills", h.AdminSkillCreate)
			admin.PUT("/about/skills/sort", h.AdminSkillSort)
			admin.PUT("/about/skills/:id", h.AdminSkillUpdate)
			admin.DELETE("/about/skills/:id", h.AdminSkillDelete)
			admin.POST("/about/projects", h.AdminProjectCreate)
			admin.PUT("/about/projects/sort", h.AdminProjectSort)
			admin.PUT("/about/projects/:id", h.AdminProjectUpdate)
			admin.DELETE("/about/projects/:id", h.AdminProjectDelete)
			admin.POST("/about/journey", h.AdminJourneyCreate)
			admin.PUT("/about/journey/:id", h.AdminJourneyUpdate)
			admin.DELETE("/about/journey/:id", h.AdminJourneyDelete)
			admin.POST("/about/contacts", h.AdminContactCreate)
			admin.PUT("/about/contacts/:id", h.AdminContactUpdate)
			admin.DELETE("/about/contacts/:id", h.AdminContactDelete)

			admin.PUT("/site-settings", h.AdminSiteSettingsUpdate)
			admin.POST("/uploads", h.Upload)
		}
	}
	return r
}
