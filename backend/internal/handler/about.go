package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/man-mu/blog/backend/internal/pkg/response"
	"github.com/man-mu/blog/backend/internal/service"
)

// AboutGet 关于页聚合读取（#B1，公开；空态永不 404）
func (h *Handler) AboutGet(c *gin.Context) {
	agg, err := h.svc.About.Get(c.Request.Context())
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, agg)
}

// AdminAboutProfileUpdate 更新资料卡（#B2，单行 upsert，3 字段）
func (h *Handler) AdminAboutProfileUpdate(c *gin.Context) {
	var req struct {
		Nickname string `json:"nickname"`
		TitleEn  string `json:"title_en"`
		Bio      string `json:"bio"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.UpdateProfile(c.Request.Context(), req.Nickname, req.TitleEn, req.Bio)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// ---------- Skills（#B3-#B6） ----------

// AdminSkillCreate 新增技能（#B3）
func (h *Handler) AdminSkillCreate(c *gin.Context) {
	var req struct {
		Name    string   `json:"name"`
		Percent *int     `json:"percent"`
		Items   []string `json:"items"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.CreateSkill(c.Request.Context(), service.SkillInput{
		Name:    req.Name,
		Percent: req.Percent,
		Items:   req.Items,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminSkillUpdate 更新技能（#B4，全量替换）
func (h *Handler) AdminSkillUpdate(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var req struct {
		Name    string   `json:"name"`
		Percent *int     `json:"percent"`
		Items   []string `json:"items"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.UpdateSkill(c.Request.Context(), id, service.SkillInput{
		Name:    req.Name,
		Percent: req.Percent,
		Items:   req.Items,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminSkillDelete 删除技能（#B5，物理删；不存在幂等成功）
func (h *Handler) AdminSkillDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.About.DeleteSkill(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// AdminSkillSort 技能批量排序（#B6，全量重排，缺项追加尾部）
func (h *Handler) AdminSkillSort(c *gin.Context) {
	var req struct {
		IDs []uint64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	if err := h.svc.About.SortSkills(c.Request.Context(), req.IDs); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// ---------- Projects（#B7-#B10） ----------

// AdminProjectCreate 新增项目（#B7）
func (h *Handler) AdminProjectCreate(c *gin.Context) {
	var req struct {
		Name        string   `json:"name"`
		URL         string   `json:"url"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.CreateProject(c.Request.Context(), service.ProjectInput{
		Name:        req.Name,
		URL:         req.URL,
		Description: req.Description,
		Tags:        req.Tags,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminProjectUpdate 更新项目（#B8，全量替换）
func (h *Handler) AdminProjectUpdate(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var req struct {
		Name        string   `json:"name"`
		URL         string   `json:"url"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.UpdateProject(c.Request.Context(), id, service.ProjectInput{
		Name:        req.Name,
		URL:         req.URL,
		Description: req.Description,
		Tags:        req.Tags,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminProjectDelete 删除项目（#B9，物理删；不存在幂等成功）
func (h *Handler) AdminProjectDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.About.DeleteProject(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// AdminProjectSort 项目批量排序（#B10）
func (h *Handler) AdminProjectSort(c *gin.Context) {
	var req struct {
		IDs []uint64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	if err := h.svc.About.SortProjects(c.Request.Context(), req.IDs); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// ---------- Journeys（#B11-#B13） ----------

// AdminJourneyCreate 新增足迹（#B11）
func (h *Handler) AdminJourneyCreate(c *gin.Context) {
	var req struct {
		Time        string   `json:"time"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.CreateJourney(c.Request.Context(), service.JourneyInput{
		Time:        req.Time,
		Title:       req.Title,
		Description: req.Description,
		Tags:        req.Tags,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminJourneyUpdate 更新足迹（#B12，全量替换）
func (h *Handler) AdminJourneyUpdate(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var req struct {
		Time        string   `json:"time"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.UpdateJourney(c.Request.Context(), id, service.JourneyInput{
		Time:        req.Time,
		Title:       req.Title,
		Description: req.Description,
		Tags:        req.Tags,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminJourneyDelete 删除足迹（#B13，物理删；不存在幂等成功）
func (h *Handler) AdminJourneyDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.About.DeleteJourney(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// ---------- Contacts（#B15-#B17，无 sort） ----------

// AdminContactCreate 新增联系方式（#B15）
func (h *Handler) AdminContactCreate(c *gin.Context) {
	var req struct {
		Label string `json:"label"`
		Value string `json:"value"`
		Icon  string `json:"icon"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.CreateContact(c.Request.Context(), service.ContactInput{
		Label: req.Label,
		Value: req.Value,
		Icon:  req.Icon,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminContactUpdate 更新联系方式（#B16，全量替换）
func (h *Handler) AdminContactUpdate(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var req struct {
		Label string `json:"label"`
		Value string `json:"value"`
		Icon  string `json:"icon"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.UpdateContact(c.Request.Context(), id, service.ContactInput{
		Label: req.Label,
		Value: req.Value,
		Icon:  req.Icon,
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}

// AdminContactDelete 删除联系方式（#B17，物理删；不存在幂等成功）
func (h *Handler) AdminContactDelete(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.About.DeleteContact(c.Request.Context(), id); err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, nil)
}

// ---------- 站点设置（#B18） ----------

// AdminSiteSettingsUpdate 站点文案 KV 部分更新（#B18，body 为白名单键子集平铺对象）
func (h *Handler) AdminSiteSettingsUpdate(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	dto, err := h.svc.About.UpdateSiteSettings(c.Request.Context(), req)
	if err != nil {
		h.fail(c, err)
		return
	}
	response.OK(c, dto)
}
