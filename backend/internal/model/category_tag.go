package model

// Category 文章分类表
type Category struct {
	ID   uint64 `gorm:"primaryKey;autoIncrement"`
	Name string `gorm:"size:50;not null;uniqueIndex:uk_categories_name"` // 分类名唯一，与 Tag.Name 行为一致
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (Category) TableName() string { return "categories" }

// Tag 标签表
type Tag struct {
	ID   uint64 `gorm:"primaryKey;autoIncrement"`
	Name string `gorm:"size:50;not null;uniqueIndex:uk_tags_name"`
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (Tag) TableName() string { return "tags" }
