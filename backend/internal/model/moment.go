package model

import (
	"time"

	"gorm.io/datatypes"
)

// 动态状态（status 恒 1 保留，C 端查询固定 WHERE status=1）
const (
	MomentStatusHidden  = 0
	MomentStatusVisible = 1
)

// Moment 个人动态表（业务表无 updated_at，D9）；
// images 为图片 URL JSON 数组，schema §7.3：service 恒显式写 "[]"，禁 NULL
type Moment struct {
	ID        uint64         `gorm:"primaryKey;autoIncrement"`
	Content   string         `gorm:"size:1000;not null"`
	Images    datatypes.JSON `gorm:"type:json;not null"` // ["url1","url2"]，≤9 张
	Status    int8           `gorm:"not null;default:1;index:idx_moments_status_created,priority:1"`
	CreatedAt time.Time      `gorm:"index:idx_moments_status_created,priority:2"`
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (Moment) TableName() string { return "moments" }
