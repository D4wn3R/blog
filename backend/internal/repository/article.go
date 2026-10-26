package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/man-mu/blog/backend/internal/model"
)

// ErrCategoryInUse 分类下仍有文章（status 1/2 任意），删除被拒（#A11）
var ErrCategoryInUse = errors.New("分类下存在文章")

// ArticleFilter 文章列表过滤条件（#A1/#A4 共用）。
// Keyword 为已做 %_\ 转义的 LIKE 片段（转义由 service 完成），非空时按 title 模糊匹配
type ArticleFilter struct {
	Status     int8   // 0 = 不筛（#A4 全部两态）；C 端固定 1；越界值自然空结果
	CategoryID uint64 // 0 = 不筛
	TagID      uint64 // 0 = 不筛；用 IN 子查询，防 many2many JOIN 行乘积（契约 #A1）
	Keyword    string // title LIKE %keyword%
	Offset     int
	Limit      int
	Admin      bool // 排序：B 端 created_at DESC, id DESC；C 端 pinned DESC, published_at DESC, id DESC
}

// ArticleJoinRow 列表主查询行：文章列 + 分类名（LEFT JOIN categories，#A1-①）
type ArticleJoinRow struct {
	model.Article
	CategoryName string `gorm:"column:category_name"`
}

// ArticleTagNameRow 标签批查行（#A1-③：article_tags JOIN tags 合批一次取回）
type ArticleTagNameRow struct {
	ArticleID uint64
	TagID     uint64
	TagName   string
}

// ArchiveRow 归档聚合行：DATE_FORMAT 输出四位年 / 两位补零月（#A15 响应口径）
type ArchiveRow struct {
	Year  string
	Month string
	Count int64
}

// applyArticleFilter 主查询与 COUNT 共用的 WHERE（同 WHERE 保证列表与 total 一致）
func applyArticleFilter(q *gorm.DB, f ArticleFilter) *gorm.DB {
	if f.Status != 0 {
		q = q.Where("articles.status = ?", f.Status)
	}
	if f.CategoryID != 0 {
		q = q.Where("articles.category_id = ?", f.CategoryID)
	}
	if f.TagID != 0 {
		q = q.Where("articles.id IN (SELECT article_id FROM article_tags WHERE tag_id = ?)", f.TagID)
	}
	if f.Keyword != "" {
		q = q.Where("articles.title LIKE ?", "%"+f.Keyword+"%")
	}
	return q
}

// ListArticles 列表主查询（#A1-①/#A4）：LEFT JOIN categories 单条 SQL 带出分类名，不取 content_md 大字段
func (r *Repository) ListArticles(ctx context.Context, f ArticleFilter) ([]ArticleJoinRow, error) {
	var rows []ArticleJoinRow
	q := r.db.WithContext(ctx).Model(&model.Article{}).
		Select("articles.*, categories.name AS category_name").
		Joins("LEFT JOIN categories ON categories.id = articles.category_id")
	q = applyArticleFilter(q, f)
	if f.Admin {
		q = q.Order("articles.created_at DESC, articles.id DESC")
	} else {
		q = q.Order("articles.pinned DESC, articles.published_at DESC, articles.id DESC")
	}
	err := q.Offset(f.Offset).Limit(f.Limit).Scan(&rows).Error
	return rows, err
}

// CountArticles 同 WHERE 的 COUNT（#A1-②）
func (r *Repository) CountArticles(ctx context.Context, f ArticleFilter) (int64, error) {
	var cnt int64
	q := r.db.WithContext(ctx).Model(&model.Article{}).
		Joins("LEFT JOIN categories ON categories.id = articles.category_id")
	err := applyArticleFilter(q, f).Count(&cnt).Error
	return cnt, err
}

// ListTagsByArticleIDs 标签批查（#A1-③）：整页文章 ID 一次 IN 取回标签名
func (r *Repository) ListTagsByArticleIDs(ctx context.Context, articleIDs []uint64) ([]ArticleTagNameRow, error) {
	var rows []ArticleTagNameRow
	err := r.db.WithContext(ctx).Table("article_tags").
		Select("article_tags.article_id AS article_id, tags.id AS tag_id, tags.name AS tag_name").
		Joins("JOIN tags ON tags.id = article_tags.tag_id").
		Where("article_tags.article_id IN ?", articleIDs).
		Order("article_tags.article_id, tags.id").
		Scan(&rows).Error
	return rows, err
}

// GetArticleBySlug 按 slug 查文章（#A2/#A3）：连带分类与标签；不存在返回 (nil, nil)
func (r *Repository) GetArticleBySlug(ctx context.Context, slug string) (*model.Article, error) {
	var a model.Article
	err := r.db.WithContext(ctx).Preload("Category").Preload("Tags").
		Where("slug = ?", slug).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// GetArticleByID 按主键查文章（#A5/#A7 前置回读）：连带分类与标签；不存在返回 (nil, nil)
func (r *Repository) GetArticleByID(ctx context.Context, id uint64) (*model.Article, error) {
	var a model.Article
	err := r.db.WithContext(ctx).Preload("Category").Preload("Tags").First(&a, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// IncrArticleViews 浏览量原子自增（#A2，失败由 service 仅记日志）
func (r *Repository) IncrArticleViews(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Model(&model.Article{}).Where("id = ?", id).
		Update("views", gorm.Expr("views + 1")).Error
}

// CreateArticle 事务建文章 + 关联标签；唯一索引冲突分类为业务错误返回（#A6）
func (r *Repository) CreateArticle(ctx context.Context, a *model.Article, tagIDs []uint64) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(a).Error; err != nil {
			return err
		}
		return insertArticleTags(tx, a.ID, tagIDs)
	})
	return classifyDup(err)
}

// UpdateArticle 事务全量更新（#A7）：Select 白名单列（含零值强制写入，如 published_at 置 NULL、
// password_hash 置空），不碰 views/created_at；标签关联删插重建（schema §7.4）
func (r *Repository) UpdateArticle(ctx context.Context, a *model.Article, tagIDs []uint64) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(a).Select(
			"title", "slug", "summary", "content_md", "cover_url", "category_id",
			"password_hash", "pinned", "minutes", "status", "published_at",
		).Updates(a).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM article_tags WHERE article_id = ?", a.ID).Error; err != nil {
			return err
		}
		return insertArticleTags(tx, a.ID, tagIDs)
	})
	return classifyDup(err)
}

// DeleteArticleByID 物理删除（#A8）：一条 DELETE，comments/article_tags 靠外键 CASCADE 自动清除；
// 返回影响行数供 service 判定存在性（不幂等）
func (r *Repository) DeleteArticleByID(ctx context.Context, id uint64) (int64, error) {
	res := r.db.WithContext(ctx).Delete(&model.Article{}, id)
	return res.RowsAffected, res.Error
}

// insertArticleTags 关联落库：article_tags 无对应 model，走参数化原生 INSERT（标签存在性已由 service 校验）
func insertArticleTags(tx *gorm.DB, articleID uint64, tagIDs []uint64) error {
	if len(tagIDs) == 0 {
		return nil
	}
	var sb strings.Builder
	sb.WriteString("INSERT INTO article_tags (article_id, tag_id) VALUES ")
	args := make([]any, 0, len(tagIDs)*2)
	for i, tagID := range tagIDs {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString("(?,?)")
		args = append(args, articleID, tagID)
	}
	return tx.Exec(sb.String(), args...).Error
}

// ListCategories 全量分类，id ASC（#A9）
func (r *Repository) ListCategories(ctx context.Context) ([]model.Category, error) {
	var list []model.Category
	err := r.db.WithContext(ctx).Order("id").Find(&list).Error
	return list, err
}

// ListCategoriesInUse 已挂靠已发布文章的分类（#A9 used=1，C 端筛选条）：
// EXISTS 关联过滤 status=1（隐藏文章不算，C 端筛不出内容）；id ASC
func (r *Repository) ListCategoriesInUse(ctx context.Context) ([]model.Category, error) {
	var list []model.Category
	err := r.db.WithContext(ctx).
		Where("EXISTS (SELECT 1 FROM articles WHERE articles.category_id = categories.id AND articles.status = 1)").
		Order("id").Find(&list).Error
	return list, err
}

// FeedArticleRow feed 全文输出行（RSS content:encoded）：轻量列集，
// content_md 为加密文章留空口径（加密文章不入 feed 全文，防泄露）
type FeedArticleRow struct {
	ID          uint64
	Slug        string
	Title       string
	Summary     string
	CoverURL    string
	ContentMD   string `gorm:"column:content_md"`
	PublishedAt *time.Time
}

// ListArticlesForFeed feed 专用查询：已发布最新 limit 篇（pinned DESC 同 C 端列表序），
// 单条 SQL 只取 feed 需要的列（不触碰加密派生字段）
func (r *Repository) ListArticlesForFeed(ctx context.Context, limit int) ([]FeedArticleRow, error) {
	var rows []FeedArticleRow
	err := r.db.WithContext(ctx).Model(&model.Article{}).
		Select("id, slug, title, summary, cover_url, content_md, published_at").
		Where("status = 1").
		Order("pinned DESC, published_at DESC, id DESC").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

// CreateCategory 建分类，唯一索引冲突分类为业务错误返回（#A10）；GORM 回填自增 ID 供创建响应返回
func (r *Repository) CreateCategory(ctx context.Context, name string) (model.Category, error) {
	c := model.Category{Name: name}
	return c, classifyDup(r.db.WithContext(ctx).Create(&c).Error)
}

// DeleteCategory 事务删分类（#A11）：FOR UPDATE 锁分类行，串行化"删分类 vs 并发在该分类建文章"；
// COUNT 文章（status 1/2 任意）>0 拒删，外键 RESTRICT 为 DB 层兜底；分类不存在静默成功（契约仅定义 409 拦截）
func (r *Repository) DeleteCategory(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var exists uint64
		if err := tx.Raw("SELECT id FROM categories WHERE id = ? FOR UPDATE", id).Scan(&exists).Error; err != nil {
			return err
		}
		if exists == 0 {
			return nil
		}
		var cnt int64
		if err := tx.Model(&model.Article{}).Where("category_id = ?", id).Count(&cnt).Error; err != nil {
			return err
		}
		if cnt > 0 {
			return ErrCategoryInUse
		}
		return tx.Delete(&model.Category{}, id).Error
	})
}

// ListTags 全量标签，id ASC（#A12）
func (r *Repository) ListTags(ctx context.Context) ([]model.Tag, error) {
	var list []model.Tag
	err := r.db.WithContext(ctx).Order("id").Find(&list).Error
	return list, err
}

// CreateTag 建标签，唯一索引冲突分类为业务错误返回（#A13）；GORM 回填自增 ID 供创建响应返回
func (r *Repository) CreateTag(ctx context.Context, name string) (model.Tag, error) {
	t := model.Tag{Name: name}
	return t, classifyDup(r.db.WithContext(ctx).Create(&t).Error)
}

// DeleteTag 事务删标签（#A14）：先显式 DELETE FROM article_tags WHERE tag_id=?（复合主键最左前缀
// 覆盖不了，走补建的 tag_id 索引），再物理删标签；返回是否存在供 service 判 404
func (r *Repository) DeleteTag(ctx context.Context, id uint64) (bool, error) {
	existed := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM article_tags WHERE tag_id = ?", id).Error; err != nil {
			return err
		}
		res := tx.Delete(&model.Tag{}, id)
		existed = res.RowsAffected > 0
		return res.Error
	})
	return existed, err
}

// ExistsCategory 分类是否存在（#A6/#A7 category_id 校验）
func (r *Repository) ExistsCategory(ctx context.Context, id uint64) (bool, error) {
	var cnt int64
	if err := r.db.WithContext(ctx).Model(&model.Category{}).Where("id = ?", id).Count(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// CountTagsByIDs 统计存在的标签数（#A6/#A7 tag_ids 全存在校验，与去重后的数量比对）
func (r *Repository) CountTagsByIDs(ctx context.Context, ids []uint64) (int64, error) {
	var cnt int64
	err := r.db.WithContext(ctx).Model(&model.Tag{}).Where("id IN ?", ids).Count(&cnt).Error
	return cnt, err
}

// AggregateArchive 归档聚合（#A15）：仅已发布且 published_at 非空，按年月倒序
func (r *Repository) AggregateArchive(ctx context.Context) ([]ArchiveRow, error) {
	var rows []ArchiveRow
	err := r.db.WithContext(ctx).Model(&model.Article{}).
		Select("DATE_FORMAT(published_at, '%Y') AS year, DATE_FORMAT(published_at, '%m') AS month, COUNT(*) AS count").
		Where("status = ? AND published_at IS NOT NULL", model.ArticleStatusPublished).
		Group("DATE_FORMAT(published_at, '%Y'), DATE_FORMAT(published_at, '%m')").
		Order("year DESC, month DESC").
		Scan(&rows).Error
	return rows, err
}
