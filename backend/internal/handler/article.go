package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/pkg/response"
	"github.com/man-mu/blog/backend/internal/service"
)

// ---------- C 端文章（#A1~#A3，公开） ----------

// ArticleList 文章列表（#A1）
func (h *Handler) ArticleList(c *gin.Context) {
	var q struct {
		Page       int    `form:"page"`
		PageSize   int    `form:"page_size"`
		CategoryID uint64 `form:"category_id"`
		TagID      uint64 `form:"tag_id"`
		Keyword    string `form:"keyword"`
	}
	if err := c.ShouldBindQuery(&q); err != nil { // 非数字/溢出 → 400（README 分页约定）
		response.BadRequest(c, "参数错误")
		return
	}
	page, err := h.svc.Article.List(c.Request.Context(), service.ArticleListQuery{
		Page:       q.Page,
		PageSize:   q.PageSize,
		CategoryID: q.CategoryID,
		TagID:      q.TagID,
		Keyword:    q.Keyword,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, page)
}

// ArticleDetail 文章详情（#A2，含加密三态；unlock_token 走 query，D-unlock）
func (h *Handler) ArticleDetail(c *gin.Context) {
	detail, err := h.svc.Article.GetBySlug(c.Request.Context(), c.Param("slug"), c.Query("unlock_token"))
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, detail)
}

// ArticleUnlock 访问密码换解锁 token（#A3，公开，不走 AuthRequired）
func (h *Handler) ArticleUnlock(c *gin.Context) {
	var req struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.Article.Unlock(c.Request.Context(), c.Param("slug"), req.Password)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// ---------- B 端文章（#A4~#A8，admin，身份校验由 AdminRequired 中间件完成） ----------

// AdminArticleList B 端文章列表（#A4，全状态）
func (h *Handler) AdminArticleList(c *gin.Context) {
	var q struct {
		Page       int    `form:"page"`
		PageSize   int    `form:"page_size"`
		Status     int8   `form:"status"`
		CategoryID uint64 `form:"category_id"`
		TagID      uint64 `form:"tag_id"`
		Keyword    string `form:"keyword"`
	}
	if err := c.ShouldBindQuery(&q); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	page, err := h.svc.Article.AdminList(c.Request.Context(), service.AdminArticleListQuery{
		Page:       q.Page,
		PageSize:   q.PageSize,
		Status:     q.Status,
		CategoryID: q.CategoryID,
		TagID:      q.TagID,
		Keyword:    q.Keyword,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, page)
}

// AdminArticleGet B 端文章详情（#A5，全字段回显）
func (h *Handler) AdminArticleGet(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	dto, err := h.svc.Article.AdminGet(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminArticleCreate 创建文章（#A6）
func (h *Handler) AdminArticleCreate(c *gin.Context) {
	var req service.ArticleUpsertReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.Article.AdminCreate(c.Request.Context(), &req)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminArticleUpdate 编辑文章（#A7，全量替换 + 指针三态）
func (h *Handler) AdminArticleUpdate(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var req service.ArticleUpsertReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.Article.AdminUpdate(c.Request.Context(), id, &req)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminArticleDelete 删除文章（#A8，物理删除不幂等）
func (h *Handler) AdminArticleDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.Article.AdminDelete(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// ---------- 分类（#A9~#A11） ----------

// CategoryList 分类列表（#A9，公开，非分页全量形态）：
// used=1 → 仅返回已挂靠已发布文章的分类（C 端筛选条）；缺省/其他值 → 全量（B 端候选池）
func (h *Handler) CategoryList(c *gin.Context) {
	list, err := h.svc.Article.ListCategories(c.Request.Context(), c.Query("used") == "1")
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, gin.H{"list": list})
}

// AdminCategoryCreate 创建分类（#A10）
func (h *Handler) AdminCategoryCreate(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.Article.CreateCategory(c.Request.Context(), req.Name)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminCategoryDelete 删除分类（#A11，有文章则拒绝）
func (h *Handler) AdminCategoryDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.Article.DeleteCategory(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// ---------- 标签（#A12~#A14） ----------

// TagList 标签列表（#A12，公开，非分页全量形态）
func (h *Handler) TagList(c *gin.Context) {
	list, err := h.svc.Article.ListTags(c.Request.Context())
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, gin.H{"list": list})
}

// AdminTagCreate 创建标签（#A13）
func (h *Handler) AdminTagCreate(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.Article.CreateTag(c.Request.Context(), req.Name)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminTagDelete 删除标签（#A14，级联清关联）
func (h *Handler) AdminTagDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.Article.DeleteTag(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// ---------- 归档（#A15，公开） ----------

// ArchiveGet 归档统计（#A15，裸数组响应）
func (h *Handler) ArchiveGet(c *gin.Context) {
	items, err := h.svc.Article.Archive(c.Request.Context())
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, items)
}

// pathID 解析 :id 路径参数（README 全局约定：一律 uint64，非法/超范围 → 400 40000）；
// 第二返回值为 false 时已写出响应
func pathID(c *gin.Context) (uint64, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.BadRequest(c, "参数错误")
		return 0, false
	}
	return id, true
}
