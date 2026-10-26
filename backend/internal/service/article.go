package service

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/man-mu/blog/backend/internal/model"
	appjwt "github.com/man-mu/blog/backend/internal/pkg/jwt"
	"github.com/man-mu/blog/backend/internal/pkg/logctx"
	"github.com/man-mu/blog/backend/internal/pkg/password"
	"github.com/man-mu/blog/backend/internal/repository"
)

// ArticleService 文章子服务：文章/分类/标签/归档（#A1~#A15）。
// slug 冲突经 errors.Is(err, repository.ErrDupSlug) → errConflict("slug 已被占用")
type ArticleService struct {
	svc *Service
}

// 常量上限全部取自 docs/API/article.md 与 docs/schema.md §2.2（写从严读宽容，schema §7.7）
const (
	_archiveStatsKey = "archive:stats" // 归档统计缓存键（#A15）
	_archiveStatsTTL = time.Hour       // 缓存 TTL 1 小时（#A15）

	_summaryAutoRunes  = 200      // 未手填摘要时自动截取正文前 200 rune（D-summary）
	_keywordMaxRunes   = 50       // keyword 截断上限（D-keyword-trunc，C/B 端一致）
	_titleMaxRunes     = 200      // 列宽即上限（schema §7.7）
	_slugMaxRunes      = 100      // 同上；>100 的 :slug 查询按 404 防探测处理
	_summaryMaxRunes   = 500      // 手填摘要 rune ≤ 500
	_coverURLMaxRunes  = 255      // 封面 rune ≤ 255，非空须以 / 开头
	_passwordMaxRunes  = 32       // #A6 密码非空时 rune ≤ 32
	_passwordMaxBytes  = 72       // bcrypt 算法硬上限（#A3/#A6）
	_contentMDMaxBytes = 16 << 20 // 正文 byte < 16MiB（schema §2.2）
	_readingCharsPerM  = 400      // 阅读速度 400 字/分钟（#A6 minutes 算法）
	_maxPage           = 1 << 50  // 页码防御上限：page_size ≤ 50，保证 (page-1)*size 不溢出
	_maxOffset         = 1 << 40  // 超限页码钳制值：远超真实数据量，等价空页
)

// _shanghaiZone 契约时区：published_at 解析后统一归一 +08:00（中国无夏令时，固定偏移即可）
var _shanghaiZone = time.FixedZone("Asia/Shanghai", 8*3600)

// _slugPattern #A6 slug 形制：^[a-z0-9]+(?:-[a-z0-9]+)*$
var _slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// _likeEscaper keyword LIKE 转义（%_\ → \% \_ \\，硬约束 11）；MySQL 默认转义字符即反斜杠
var _likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// ---------- DTO（手写白名单，禁序列化 GORM 模型，schema §7.5） ----------

// ArticleListItem #A1 列表项（契约 ArticleListItem 表；#A4 在此之上叠加 status/created_at）
type ArticleListItem struct {
	ID           uint64     `json:"id"`
	Slug         string     `json:"slug"` // C 端列表卡片跳详情 /posts/:slug 依赖（实现期补全契约缺口）
	Title        string     `json:"title"`
	Summary      string     `json:"summary"`
	CoverURL     string     `json:"cover_url"`
	CategoryName string     `json:"category_name"`
	Tags         []string   `json:"tags"`
	Pinned       bool       `json:"pinned"`
	Minutes      int        `json:"minutes"`
	PublishedAt  *time.Time `json:"published_at"` // 可空时间输出 null（契约），不用 omitzero/omitempty
	Views        int64      `json:"views"`
	HasPassword  bool       `json:"has_password"`
}

// AdminArticleListItem #A4 列表项：#A1 字段 + status + created_at（排序 created_at DESC, id DESC）
type AdminArticleListItem struct {
	ArticleListItem
	Status    int8      `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// ArticleDetailDTO #A2 详情（三态共用同一 DTO；加密未解锁时 content_md 为空串）
type ArticleDetailDTO struct {
	ID          uint64      `json:"id"`
	Title       string      `json:"title"`
	Slug        string      `json:"slug"`
	CoverURL    string      `json:"cover_url"`
	HasPassword bool        `json:"has_password"`
	Summary     string      `json:"summary"`
	ContentMD   string      `json:"content_md"`
	Unlocked    bool        `json:"unlocked"`
	Pinned      bool        `json:"pinned"`
	Minutes     int         `json:"minutes"`
	PublishedAt *time.Time  `json:"published_at"`
	Views       int64       `json:"views"`
	Category    CategoryDTO `json:"category"`
	Tags        []TagDTO    `json:"tags"`
}

// UnlockDTO #A3 响应：独立 unlock token（claims 仅 aid，10 分钟）
type UnlockDTO struct {
	UnlockToken string `json:"unlock_token"`
	ExpiresIn   int64  `json:"expires_in"`
}

// AdminArticleDTO #A5/#A6/#A7 响应：全字段回显（无 updated_at，D-no-updated-at）
type AdminArticleDTO struct {
	ID           uint64     `json:"id"`
	Title        string     `json:"title"`
	Slug         string     `json:"slug"`
	Summary      string     `json:"summary"`
	ContentMD    string     `json:"content_md"`
	CoverURL     string     `json:"cover_url"`
	CategoryID   uint64     `json:"category_id"`
	CategoryName string     `json:"category_name"`
	Tags         []TagDTO   `json:"tags"`
	Pinned       bool       `json:"pinned"`
	Minutes      int        `json:"minutes"`
	HasPassword  bool       `json:"has_password"`
	Status       int8       `json:"status"`
	Views        int64      `json:"views"`
	PublishedAt  *time.Time `json:"published_at"`
	CreatedAt    time.Time  `json:"created_at"`
}

// ArchiveItem #A15 归档项（裸数组响应，month 两位补零字符串）
type ArchiveItem struct {
	Year  string `json:"year"`
	Month string `json:"month"`
	Count int64  `json:"count"`
}

// ArticleListQuery #A1 查询参数（handler 绑定后原样传入，keyword 由 service 截断转义）
type ArticleListQuery struct {
	Page       int
	PageSize   int
	CategoryID uint64
	TagID      uint64
	Keyword    string
}

// AdminArticleListQuery #A4 查询参数：status 缺省/0 = 全部两态，非 1/2 越界值 → 空结果
type AdminArticleListQuery struct {
	Page       int
	PageSize   int
	Status     int8
	CategoryID uint64
	TagID      uint64
	Keyword    string
}

// ArticleUpsertReq #A6/#A7 请求体：password/published_at 用指针承载三态（D-update-semantics）
type ArticleUpsertReq struct {
	Title       string   `json:"title"`
	Slug        string   `json:"slug"`
	ContentMD   string   `json:"content_md"`
	Summary     string   `json:"summary"`
	CoverURL    string   `json:"cover_url"`
	CategoryID  uint64   `json:"category_id"`
	TagIDs      []uint64 `json:"tag_ids"`
	Password    *string  `json:"password"` // nil = 不加密(#A6)/不变(#A7)；"" = 不加密/取消加密；非空 = 设置
	Pinned      bool     `json:"pinned"`
	Status      int8     `json:"status"`       // #A6 缺省 1；#A7 全量替换必传，仅接受 1/2
	PublishedAt *string  `json:"published_at"` // RFC3339；nil = 状态机（见 #A6/#A7）
}

// articleUpsertInput 校验通过后的规范化输入（service 内部）
type articleUpsertInput struct {
	title       string
	slug        string
	contentMD   string // 原始值不 TrimSpace（Markdown 正文原样落库）
	summary     string // 手填值（TrimSpace 后），空 = 未手填
	coverURL    string
	categoryID  uint64
	tagIDs      []uint64 // 去重剔 0 后
	publishedAt *time.Time
	pinned      bool
	status      int8
}

// ---------- C 端（#A1~#A3） ----------

// List C 端文章列表（#A1）：仅 status=1，整页 ≤3 条 SQL（主查询/COUNT/标签批查）
func (s *ArticleService) List(ctx context.Context, q ArticleListQuery) (*PageDTO, error) {
	page, size := NormalizePage(q.Page, q.PageSize)
	f := repository.ArticleFilter{
		Status:     model.ArticleStatusPublished,
		CategoryID: q.CategoryID,
		TagID:      q.TagID,
		Keyword:    _likeEscaper.Replace(clampKeyword(q.Keyword)),
		Offset:     pageOffset(page, size),
		Limit:      size,
	}
	rows, total, err := s.queryPage(ctx, f)
	if err != nil {
		return nil, err
	}
	items, err := s.buildListItems(ctx, rows)
	if err != nil {
		return nil, err
	}
	return &PageDTO{List: items, Total: total, Page: page, PageSize: size}, nil
}

// AdminList B 端文章列表（#A4）：全状态，排序 created_at DESC, id DESC
func (s *ArticleService) AdminList(ctx context.Context, q AdminArticleListQuery) (*PageDTO, error) {
	page, size := NormalizePage(q.Page, q.PageSize)
	f := repository.ArticleFilter{
		Status:     q.Status,
		CategoryID: q.CategoryID,
		TagID:      q.TagID,
		Keyword:    _likeEscaper.Replace(clampKeyword(q.Keyword)),
		Offset:     pageOffset(page, size),
		Limit:      size,
		Admin:      true,
	}
	rows, total, err := s.queryPage(ctx, f)
	if err != nil {
		return nil, err
	}
	base, err := s.buildListItems(ctx, rows)
	if err != nil {
		return nil, err
	}
	items := make([]AdminArticleListItem, 0, len(rows))
	for i := range rows {
		items = append(items, AdminArticleListItem{
			ArticleListItem: base[i],
			Status:          rows[i].Status,
			CreatedAt:       rows[i].CreatedAt,
		})
	}
	return &PageDTO{List: items, Total: total, Page: page, PageSize: size}, nil
}

// queryPage 主查询 + COUNT（#A1-①②，同 WHERE 保证 total 一致）；错误统一收敛 50000
func (s *ArticleService) queryPage(ctx context.Context, f repository.ArticleFilter) ([]repository.ArticleJoinRow, int64, error) {
	rows, err := s.svc.Repo.ListArticles(ctx, f)
	if err != nil {
		return nil, 0, errServer(err)
	}
	total, err := s.svc.Repo.CountArticles(ctx, f)
	if err != nil {
		return nil, 0, errServer(err)
	}
	return rows, total, nil
}

// buildListItems 列表项组装（#A1-③ 标签合批 IN 一查 + DTO 白名单；tags 保证非 nil）
func (s *ArticleService) buildListItems(ctx context.Context, rows []repository.ArticleJoinRow) ([]ArticleListItem, error) {
	ids := make([]uint64, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}
	tagMap := make(map[uint64][]string, len(rows))
	if len(ids) > 0 {
		tagRows, err := s.svc.Repo.ListTagsByArticleIDs(ctx, ids)
		if err != nil {
			return nil, errServer(err)
		}
		for i := range tagRows {
			tagMap[tagRows[i].ArticleID] = append(tagMap[tagRows[i].ArticleID], tagRows[i].TagName)
		}
	}
	items := make([]ArticleListItem, 0, len(rows))
	for i := range rows {
		r := &rows[i]
		items = append(items, ArticleListItem{
			ID:           r.ID,
			Slug:         r.Slug,
			Title:        r.Title,
			Summary:      r.Summary,
			CoverURL:     r.CoverURL,
			CategoryName: r.CategoryName,
			Tags:         nonNil(tagMap[r.ID]),
			Pinned:       r.Pinned,
			Minutes:      int(r.Minutes),
			PublishedAt:  r.PublishedAt,
			Views:        int64(r.Views),
			HasPassword:  r.PasswordHash != "",
		})
	}
	return items, nil
}

// GetBySlug C 端文章详情（#A2）：不存在/隐藏/超长一律 404 同口径防探测；
// 加密文章未解锁时 content_md 输出空串，views 返回本次查询值 +1（自增失败仅记日志）
func (s *ArticleService) GetBySlug(ctx context.Context, slug, unlockToken string) (*ArticleDetailDTO, error) {
	if utf8.RuneCountInString(slug) > _slugMaxRunes {
		return nil, errNotFound("文章不存在")
	}
	a, err := s.svc.Repo.GetArticleBySlug(ctx, slug)
	if err != nil {
		return nil, errServer(err)
	}
	if a == nil || a.Status == model.ArticleStatusHidden {
		return nil, errNotFound("文章不存在") // 与不存在同口径，防探测
	}
	hasPassword := a.PasswordHash != ""
	unlocked := !hasPassword // 公开文章恒解锁，unlock_token 参数被忽略
	if hasPassword && unlockToken != "" {
		claims, err := appjwt.Parse(s.svc.Cfg.JWT.Secret, unlockToken)
		// 无效/过期/aid 不匹配统一话术，防探测（#A2/D-unlock）
		if err != nil || claims.ArticleID != a.ID {
			return nil, errUnauthorized("解锁凭证无效或已过期")
		}
		unlocked = true
	}
	if err := s.svc.Repo.IncrArticleViews(ctx, a.ID); err != nil {
		// 失败仅记日志，不影响响应
		logctx.From(ctx).Warn("incr article views", "article_id", a.ID, "err", err)
	}
	contentMD := ""
	if unlocked {
		contentMD = a.ContentMD
	}
	categoryName := ""
	if a.Category != nil {
		categoryName = a.Category.Name
	}
	return &ArticleDetailDTO{
		ID:          a.ID,
		Title:       a.Title,
		Slug:        a.Slug,
		CoverURL:    a.CoverURL,
		HasPassword: hasPassword,
		Summary:     a.Summary, // 落库值直出：加密文章写时已存空串，无泄露面
		ContentMD:   contentMD,
		Unlocked:    unlocked,
		Pinned:      a.Pinned,
		Minutes:     int(a.Minutes),
		PublishedAt: a.PublishedAt,
		Views:       int64(a.Views) + 1,
		Category:    CategoryDTO{ID: a.CategoryID, Name: categoryName},
		Tags:        toTagDTOs(a.Tags),
	}, nil
}

// Unlock 访问密码换解锁 token（#A3）：非空判定用 TrimSpace 值，长度校验与 bcrypt 均用原始值；
// 无状态 JWT（claims 仅 aid）不进 Redis、不走 AuthRequired；首版不做限流（D-bruteforce）
func (s *ArticleService) Unlock(ctx context.Context, slug, pw string) (*UnlockDTO, error) {
	if strings.TrimSpace(pw) == "" {
		return nil, errBadRequest("密码不能为空")
	}
	if len(pw) > _passwordMaxBytes {
		return nil, errBadRequest("密码过长")
	}
	if utf8.RuneCountInString(slug) > _slugMaxRunes {
		return nil, errNotFound("文章不存在") // 与 #A2 同口径防探测
	}
	a, err := s.svc.Repo.GetArticleBySlug(ctx, slug)
	if err != nil {
		return nil, errServer(err)
	}
	if a == nil || a.Status == model.ArticleStatusHidden {
		return nil, errNotFound("文章不存在")
	}
	if a.PasswordHash == "" {
		return nil, errConflict("该文章无需密码")
	}
	if !password.Verify(a.PasswordHash, pw) {
		return nil, errUnauthorized("文章密码错误")
	}
	token, err := appjwt.Sign(s.svc.Cfg.JWT.Secret, s.svc.Cfg.JWT.UnlockExpire, &appjwt.Claims{ArticleID: a.ID})
	if err != nil {
		return nil, errServer(err)
	}
	return &UnlockDTO{
		UnlockToken: token,
		ExpiresIn:   int64(s.svc.Cfg.JWT.UnlockExpire.Seconds()),
	}, nil
}

// ---------- B 端（#A4~#A8） ----------

// AdminGet B 端文章详情（#A5）：全字段回显，隐藏文章可查；不存在 → 404
func (s *ArticleService) AdminGet(ctx context.Context, id uint64) (*AdminArticleDTO, error) {
	a, err := s.svc.Repo.GetArticleByID(ctx, id)
	if err != nil {
		return nil, errServer(err)
	}
	if a == nil {
		return nil, errNotFound("文章不存在")
	}
	return toAdminArticleDTO(a), nil
}

// AdminCreate 创建文章（#A6）：写时计算 minutes/summary（D-summary），slug 冲突 409；
// 成功后 DEL 归档缓存（#A15 失效约定）
func (s *ArticleService) AdminCreate(ctx context.Context, req *ArticleUpsertReq) (*AdminArticleDTO, error) {
	in, err := s.validateUpsert(ctx, req, false)
	if err != nil {
		return nil, err
	}
	hash, err := upsertPasswordHash(req, "")
	if err != nil {
		return nil, err
	}
	publishedAt := in.publishedAt
	if publishedAt == nil && in.status == model.ArticleStatusPublished {
		publishedAt = new(time.Now().In(_shanghaiZone)) // 不传且发布 → now；status=2 → 保持 null
	}
	a := &model.Article{
		Title:        in.title,
		Slug:         in.slug,
		Summary:      calcSummary(in.contentMD, in.summary, hash != ""),
		ContentMD:    in.contentMD,
		CoverURL:     in.coverURL,
		CategoryID:   in.categoryID,
		PasswordHash: hash,
		Pinned:       in.pinned,
		Minutes:      calcMinutes(in.contentMD),
		Status:       in.status,
		PublishedAt:  publishedAt,
	}
	if err := s.svc.Repo.CreateArticle(ctx, a, in.tagIDs); err != nil {
		if errors.Is(err, repository.ErrDupSlug) {
			return nil, errConflict("slug 已被占用")
		}
		return nil, errServer(err)
	}
	s.invalidateArchive(ctx)
	return s.AdminGet(ctx, a.ID)
}

// AdminUpdate 编辑文章（#A7，全量替换）：password/published_at 指针三态（D-update-semantics）；
// minutes 每次保存重算，summary 与密码状态联动防泄露；slug 冲突排除自身（UPDATE 天然排除）→ 409
func (s *ArticleService) AdminUpdate(ctx context.Context, id uint64, req *ArticleUpsertReq) (*AdminArticleDTO, error) {
	in, err := s.validateUpsert(ctx, req, true)
	if err != nil {
		return nil, err
	}
	old, err := s.svc.Repo.GetArticleByID(ctx, id)
	if err != nil {
		return nil, errServer(err)
	}
	if old == nil {
		return nil, errNotFound("文章不存在")
	}
	hash, err := upsertPasswordHash(req, old.PasswordHash)
	if err != nil {
		return nil, err
	}
	var publishedAt *time.Time
	if req.PublishedAt == nil {
		// 不传 = 状态机：status=1 且原值为 nil → now，其余保留（D-update-semantics）
		if in.status == model.ArticleStatusPublished && old.PublishedAt == nil {
			publishedAt = new(time.Now().In(_shanghaiZone))
		} else {
			publishedAt = old.PublishedAt
		}
	} else {
		publishedAt = in.publishedAt // 传合法 RFC3339 = 覆盖
	}
	a := &model.Article{
		ID:           id,
		Title:        in.title,
		Slug:         in.slug,
		Summary:      calcSummary(in.contentMD, in.summary, hash != ""), // 手填值不动；加密清空；空值按截取规则重算
		ContentMD:    in.contentMD,
		CoverURL:     in.coverURL,
		CategoryID:   in.categoryID,
		PasswordHash: hash,
		Pinned:       in.pinned,
		Minutes:      calcMinutes(in.contentMD), // #A7 每次保存重算
		Status:       in.status,
		PublishedAt:  publishedAt,
	}
	if err := s.svc.Repo.UpdateArticle(ctx, a, in.tagIDs); err != nil {
		if errors.Is(err, repository.ErrDupSlug) {
			return nil, errConflict("slug 已被占用")
		}
		return nil, errServer(err)
	}
	s.invalidateArchive(ctx)
	return s.AdminGet(ctx, id)
}

// AdminDelete 删除文章（#A8）：物理删除，不幂等（不存在 → 404，与 moment/friend-link 刻意不同）；
// 评论/标签关联由外键 CASCADE 自动清除，无孤儿
func (s *ArticleService) AdminDelete(ctx context.Context, id uint64) error {
	affected, err := s.svc.Repo.DeleteArticleByID(ctx, id)
	if err != nil {
		return errServer(err)
	}
	if affected == 0 {
		return errNotFound("文章不存在")
	}
	s.invalidateArchive(ctx)
	return nil
}

// validateUpsert #A6/#A7 写侧从严校验（schema §7.7）：TrimSpace + rune 上限逐字段；
// update=true 时 status 必须显式传（全量替换），否则缺省 1
func (s *ArticleService) validateUpsert(ctx context.Context, req *ArticleUpsertReq, update bool) (*articleUpsertInput, error) {
	in := &articleUpsertInput{pinned: req.Pinned}
	in.title = strings.TrimSpace(req.Title)
	if in.title == "" {
		return nil, errBadRequest("标题不能为空")
	}
	if utf8.RuneCountInString(in.title) > _titleMaxRunes {
		return nil, errBadRequest("标题过长")
	}
	in.slug = strings.TrimSpace(req.Slug)
	if in.slug == "" {
		return nil, errBadRequest("slug 不能为空")
	}
	if utf8.RuneCountInString(in.slug) > _slugMaxRunes {
		return nil, errBadRequest("slug 过长")
	}
	if !_slugPattern.MatchString(in.slug) {
		return nil, errBadRequest("slug 仅支持小写字母、数字与中划线组合")
	}
	in.contentMD = req.ContentMD
	if strings.TrimSpace(in.contentMD) == "" {
		return nil, errBadRequest("正文不能为空")
	}
	if len(in.contentMD) >= _contentMDMaxBytes {
		return nil, errBadRequest("正文过大")
	}
	in.summary = strings.TrimSpace(req.Summary)
	if utf8.RuneCountInString(in.summary) > _summaryMaxRunes {
		return nil, errBadRequest("摘要过长")
	}
	in.coverURL = strings.TrimSpace(req.CoverURL)
	if in.coverURL != "" && !strings.HasPrefix(in.coverURL, "/") {
		return nil, errBadRequest("封面地址须以 / 开头")
	}
	if utf8.RuneCountInString(in.coverURL) > _coverURLMaxRunes {
		return nil, errBadRequest("封面地址过长")
	}
	if req.CategoryID == 0 {
		return nil, errBadRequest("分类不存在")
	}
	ok, err := s.svc.Repo.ExistsCategory(ctx, req.CategoryID)
	if err != nil {
		return nil, errServer(err)
	}
	if !ok {
		return nil, errBadRequest("分类不存在") // category_id 必填非零，外键 RESTRICT，无"未分类"态
	}
	in.categoryID = req.CategoryID
	in.tagIDs = dedupeTagIDs(req.TagIDs)
	if len(in.tagIDs) > 0 {
		cnt, err := s.svc.Repo.CountTagsByIDs(ctx, in.tagIDs)
		if err != nil {
			return nil, errServer(err)
		}
		if cnt != int64(len(in.tagIDs)) {
			return nil, errBadRequest("标签不存在")
		}
	}
	switch {
	case !update && req.Status == 0: // #A6 缺省 = 1
		in.status = model.ArticleStatusPublished
	case req.Status == model.ArticleStatusPublished || req.Status == model.ArticleStatusHidden:
		in.status = req.Status
	default: // #A7 未传（0）与越界值一律 400（全量替换从严）
		return nil, errBadRequest("状态值非法")
	}
	if req.PublishedAt != nil {
		t, err := time.Parse(time.RFC3339, *req.PublishedAt)
		if err != nil {
			return nil, errBadRequest("发布时间格式错误")
		}
		published := t.In(_shanghaiZone)
		in.publishedAt = &published // 解析归一 +08:00
	}
	return in, nil
}

// upsertPasswordHash #A6/#A7 密码字段三态落库（D-update-semantics）：
// nil = 不变（沿用 current，#A6 恒传 ""）；"" = 取消加密；非空 = 校验后 bcrypt 入库
func upsertPasswordHash(req *ArticleUpsertReq, current string) (string, error) {
	if req.Password == nil {
		return current, nil
	}
	pw := *req.Password
	if pw == "" {
		return "", nil
	}
	if utf8.RuneCountInString(pw) > _passwordMaxRunes || len(pw) > _passwordMaxBytes {
		return "", errBadRequest("密码过长")
	}
	hash, err := password.Hash(pw)
	if err != nil {
		return "", errServer(err)
	}
	return hash, nil
}

// ---------- 归档（#A15） ----------

// Archive 归档统计（#A15）：Redis 缓存 "archive:stats" TTL 1h；未命中/Redis 异常/脏数据
// 降级走 SQL 聚合；写回失败仅记日志；响应为裸数组，空数据返回 []
func (s *ArticleService) Archive(ctx context.Context) ([]ArchiveItem, error) {
	if cached, err := s.svc.Redis.Get(ctx, _archiveStatsKey).Result(); err == nil {
		var items []ArchiveItem
		if json.Unmarshal([]byte(cached), &items) == nil && items != nil {
			return items, nil
		}
	}
	rows, err := s.svc.Repo.AggregateArchive(ctx)
	if err != nil {
		return nil, errServer(err)
	}
	items := make([]ArchiveItem, 0, len(rows))
	for i := range rows {
		items = append(items, ArchiveItem{Year: rows[i].Year, Month: rows[i].Month, Count: rows[i].Count})
	}
	if b, err := json.Marshal(items); err == nil {
		if err := s.svc.Redis.Set(ctx, _archiveStatsKey, b, _archiveStatsTTL).Err(); err != nil {
			// 写缓存失败仅记日志
			logctx.From(ctx).Warn("cache archive stats", "err", err)
		}
	}
	return items, nil
}

// invalidateArchive 归档缓存失效：#A6/#A7/#A8 成功后整 key DEL，失败靠 TTL 兜底
func (s *ArticleService) invalidateArchive(ctx context.Context) {
	if err := s.svc.Redis.Del(ctx, _archiveStatsKey).Err(); err != nil {
		logctx.From(ctx).Warn("invalidate archive cache", "err", err)
	}
}

// ---------- 内部 helper ----------

// pageOffset 计算分页 offset：页码超防御上限时钳到 _maxOffset（等价空页），
// 防 (page-1)*size 溢出为负导致 GORM 忽略 OFFSET 回落第一页
func pageOffset(page, size int) int {
	if page > _maxPage {
		return _maxOffset
	}
	return (page - 1) * size
}

// clampKeyword keyword 读宽容处理（D-keyword-trunc，C/B 端一致）：TrimSpace、纯空格视为未传、超长截 50 rune
func clampKeyword(k string) string {
	k = strings.TrimSpace(k)
	if runes := []rune(k); len(runes) > _keywordMaxRunes {
		return string(runes[:_keywordMaxRunes])
	}
	return k
}

// calcSummary 写时摘要（D-summary）：加密禁截取防泄露；手填值优先；未手填截取正文前 200 rune。
// #A7 联动由此统一覆盖：content_md 变更重算、password 由无变有清空、由有变无按截取规则重算
func calcSummary(contentMD, handFilled string, encrypted bool) string {
	if encrypted {
		return ""
	}
	if handFilled != "" {
		return handFilled
	}
	return truncateRunes(summarySource(contentMD), _summaryAutoRunes)
}

// summarySource 摘要取材：剔除结构性标记行（#/## 标题、> 引用、-/*/序号列表、``` 围栏、
// 表格分隔、图片/链接定义行），只留实际叙述文本——作者用 # 分节时摘要不再被标题占满；
// 行内强调标记（**粗体**、`代码`）不剥，保持摘要与正文观感一致
func summarySource(contentMD string) string {
	var lines []string
	inFence := false
	for _, line := range strings.Split(contentMD, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}
		if trimmed == "" ||
			strings.HasPrefix(trimmed, "#") ||
			strings.HasPrefix(trimmed, ">") ||
			strings.HasPrefix(trimmed, "- ") ||
			strings.HasPrefix(trimmed, "* ") ||
			strings.HasPrefix(trimmed, "+ ") ||
			strings.HasPrefix(trimmed, "|") ||
			strings.HasPrefix(trimmed, "![") ||
			// 有序列表 "1. "/"10) "：数字前缀后接 . 或 )
			(len(trimmed) > 1 && isDigitByte(trimmed[0]) && strings.IndexAny(trimmed, ".)") > 0 && strings.IndexAny(trimmed, ".)") <= 4) {
			continue
		}
		lines = append(lines, trimmed)
		if utf8.RuneCountInString(strings.Join(lines, " ")) >= _summaryAutoRunes {
			break
		}
	}
	return strings.Join(lines, " ")
}

func isDigitByte(b byte) bool { return b >= '0' && b <= '9' }

// calcMinutes 阅读时长写时计算：正文 rune 数 ÷ 400 向上取整，最少 1（#A6，落库列 uint32）；
// 摘要按 rune 截断复用同包 oauth.go 的 truncateRunes（schema §7.7 长度口径均以 rune 计）
func calcMinutes(contentMD string) uint32 {
	runes := utf8.RuneCountInString(contentMD)
	return uint32(max(1, (runes+_readingCharsPerM-1)/_readingCharsPerM))
}

// dedupeTagIDs tag_ids 去重剔 0（#A6，保持传入顺序）
func dedupeTagIDs(ids []uint64) []uint64 {
	seen := make(map[uint64]struct{}, len(ids))
	out := make([]uint64, 0, len(ids))
	for _, id := range ids {
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

// nonNil 保证列表字段非 nil（README：空列表必须返回 []，禁 null）
func nonNil[T any](src []T) []T {
	out := make([]T, 0, len(src))
	return append(out, src...)
}

// toAdminArticleDTO model.Article → #A5 全字段白名单 DTO
func toAdminArticleDTO(a *model.Article) *AdminArticleDTO {
	categoryName := ""
	if a.Category != nil {
		categoryName = a.Category.Name
	}
	return &AdminArticleDTO{
		ID:           a.ID,
		Title:        a.Title,
		Slug:         a.Slug,
		Summary:      a.Summary,
		ContentMD:    a.ContentMD,
		CoverURL:     a.CoverURL,
		CategoryID:   a.CategoryID,
		CategoryName: categoryName,
		Tags:         toTagDTOs(a.Tags),
		Pinned:       a.Pinned,
		Minutes:      int(a.Minutes),
		HasPassword:  a.PasswordHash != "",
		Status:       a.Status,
		Views:        int64(a.Views),
		PublishedAt:  a.PublishedAt,
		CreatedAt:    a.CreatedAt,
	}
}
