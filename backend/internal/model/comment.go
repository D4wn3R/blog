package model

import "time"

// 评论状态（非 gorm.DeletedAt，查询须显式过滤）
const (
	CommentStatusNormal  = 0
	CommentStatusDeleted = 1 // 墓碑
)

// Comment 评论表（楼中楼：parent_id 直接父级，root_id 所在子树根，顶级评论 root_id = 自身 id）
type Comment struct {
	ID            uint64 `gorm:"primaryKey;autoIncrement"`
	ArticleID     uint64 `gorm:"not null;index:idx_comments_article_status,priority:1"`
	UserID        uint64 `gorm:"not null;index"`
	ParentID      uint64 `gorm:"not null;default:0"` // 0 = 顶级评论
	RootID        uint64 `gorm:"not null;default:0;index"`
	ReplyToUserID uint64 `gorm:"index"` // 被回复人（楼中楼显示 @昵称）
	Content       string `gorm:"size:1000;not null"`
	Status        int8   `gorm:"not null;default:0;index:idx_comments_article_status,priority:2"`
	CreatedAt     time.Time

	User    *User    `gorm:"foreignKey:UserID"`
	Article *Article `gorm:"foreignKey:ArticleID;constraint:OnDelete:CASCADE"` // 文章物理删除时评论级联清除（D-hard-delete）
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (Comment) TableName() string { return "comments" }
