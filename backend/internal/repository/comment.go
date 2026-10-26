package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"

	"github.com/man-mu/blog/backend/internal/model"
)

// CommentRow #C1 单条 SQL 的扫描结果：评论行 + LEFT JOIN users 的作者/被回复人信息
// （D-comment-user-join：实时 JOIN，不冗余快照列；#C1 全量树仅此一条 SQL，schema §7.6）
type CommentRow struct {
	ID              uint64    `gorm:"column:id"`
	UserID          uint64    `gorm:"column:user_id"`
	ParentID        uint64    `gorm:"column:parent_id"`
	RootID          uint64    `gorm:"column:root_id"`
	ReplyToUserID   uint64    `gorm:"column:reply_to_user_id"`
	Content         string    `gorm:"column:content"`
	Status          int8      `gorm:"column:status"`
	CreatedAt       time.Time `gorm:"column:created_at"`
	Username        string    `gorm:"column:username"`
	Avatar          string    `gorm:"column:avatar"`
	ReplyToUsername string    `gorm:"column:reply_to_username"`
}

// GetVisibleArticleIDBySlug 按 slug 取已发布文章 ID（#C1/#C2 首步防探测，与 #A2 口径一致）：
// 不存在/隐藏 → (0, nil)，service 层翻译为 40400 文章不存在（slug 不 TrimSpace，超长自然查不到）
func (r *Repository) GetVisibleArticleIDBySlug(ctx context.Context, slug string) (uint64, error) {
	var row struct {
		ID uint64 `gorm:"column:id"`
	}
	err := r.db.WithContext(ctx).Model(&model.Article{}).
		Select("id").
		Where("slug = ? AND status = ?", slug, model.ArticleStatusPublished).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return row.ID, nil
}

// ListCommentsByArticle 取文章全部评论（不滤 status，墓碑由 service 剪枝），
// 双 LEFT JOIN users 分别取作者与被回复人（被 @ 人 id 即 reply_to_user_id，无需再取列）
func (r *Repository) ListCommentsByArticle(ctx context.Context, articleID uint64) ([]CommentRow, error) {
	rows := make([]CommentRow, 0, 64)
	err := r.db.WithContext(ctx).
		Table("comments c").
		Select("c.id, c.user_id, c.parent_id, c.root_id, c.reply_to_user_id, c.content, c.status, c.created_at, u.username, u.avatar, ru.username AS reply_to_username").
		Joins("LEFT JOIN users u ON u.id = c.user_id").
		Joins("LEFT JOIN users ru ON ru.id = c.reply_to_user_id").
		Where("c.article_id = ?", articleID).
		Scan(&rows).Error
	return rows, err
}

// GetCommentByID 按主键查评论；不存在返回 (nil, nil)。
// #C2 校验父评论（需 article_id/status/parent_id/root_id）、#C3 校验归属，共用整行查询
func (r *Repository) GetCommentByID(ctx context.Context, id uint64) (*model.Comment, error) {
	var comment model.Comment
	err := r.db.WithContext(ctx).Take(&comment, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &comment, nil
}

// CreateComment 插入评论；顶级（parent_id = 0）在 INSERT 后回填 root_id = 自身 id（契约 #C2），
// 回复的 root_id 由 service 按 parent 推导后随插入落库
func (r *Repository) CreateComment(ctx context.Context, comment *model.Comment) error {
	db := r.db.WithContext(ctx)
	if err := db.Create(comment).Error; err != nil {
		return err
	}
	if comment.ParentID == 0 {
		comment.RootID = comment.ID
		return db.Model(&model.Comment{}).Where("id = ?", comment.ID).Update("root_id", comment.ID).Error
	}
	return nil
}

// SoftDeleteCommentSubtree 软删整棵子树转墓碑（#C3，D-comment-tombstone）：
// 递归 CTE 沿 parent_id 取自身及全部后代一次性置为 status=1，无事务；
// status=0 条件兜底并发重复删除（幂等）
func (r *Repository) SoftDeleteCommentSubtree(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Exec(`
WITH RECURSIVE subtree AS (
	SELECT id FROM comments WHERE id = ?
	UNION ALL
	SELECT c.id FROM comments c JOIN subtree s ON c.parent_id = s.id
)
UPDATE comments SET status = ? WHERE id IN (SELECT id FROM subtree) AND status = ?`,
		id, model.CommentStatusDeleted, model.CommentStatusNormal).Error
}
