package model

import "time"

// 文章状态（D-status-enum 两态，硬删除无软删态）
const (
	ArticleStatusPublished = 1
	ArticleStatusHidden    = 2
)

// Article 文章表（业务表无 updated_at，D9）
type Article struct {
	ID           uint64     `gorm:"primaryKey;autoIncrement"`
	Title        string     `gorm:"size:200;not null"`
	Summary      string     `gorm:"size:500;not null;default:''"` // 列表页摘要，写时落库
	ContentMD    string     `gorm:"type:mediumtext"`              // Markdown 原文
	CoverURL     string     `gorm:"size:255"`                     // 封面图（/files/{object} 相对路径）
	CategoryID   uint64     `gorm:"not null"`                     // 必填非零，FK RESTRICT + service 409 双层兜底
	Slug         string     `gorm:"size:100;not null;uniqueIndex:uk_articles_slug"`
	PasswordHash string     `gorm:"size:255"` // 空 = 不加密，has_password 由非空推导
	Pinned       bool       `gorm:"not null;default:false"`
	Minutes      uint32     `gorm:"not null;default:0"` // 阅读时长（分钟），写时计算
	Status       int8       `gorm:"not null;default:1;index:idx_articles_status_published,priority:1"`
	Views        uint64     `gorm:"not null;default:0"`
	PublishedAt  *time.Time `gorm:"index:idx_articles_status_published,priority:2"`
	CreatedAt    time.Time

	Category *Category `gorm:"foreignKey:CategoryID;constraint:OnDelete:RESTRICT"`
	// many2many 关联表 article_tags 两侧外键 ON DELETE CASCADE（schema §7.1，
	// AutoMigrate 后应 SHOW CREATE TABLE 验证约束存在）
	Tags []Tag `gorm:"many2many:article_tags;constraint:OnDelete:CASCADE"`
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (Article) TableName() string { return "articles" }
