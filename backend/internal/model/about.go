// Package model 领域模型（GORM）与业务枚举，供 repository/service 层引用
package model

import "time"

// 关于页四张列表表公共约定（D-about-aggregate）：
// id BIGINT PK、sort INT NOT NULL DEFAULT 0（contacts 除外，journeys 已废 sort）、created_at，
// 均无 updated_at（D9）；读侧固定 ORDER BY sort ASC, id ASC，contacts 按 id ASC，journeys 按时间降序

// AboutSkill 技能栈（#B3-#B6）
type AboutSkill struct {
	ID        uint64 `gorm:"primaryKey;autoIncrement"`
	Sort      int    `gorm:"not null;default:0;index:idx_about_skills_sort"`
	Name      string `gorm:"size:50;not null"`
	Percent   uint8  `gorm:"not null;default:0"` // 0-100
	Items     string `gorm:"size:255"`           // 逗号分隔串，≤10 元素各 ≤30 rune
	CreatedAt time.Time
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (AboutSkill) TableName() string { return "about_skills" }

// AboutProject 项目（#B7-#B10）
type AboutProject struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	Sort        int    `gorm:"not null;default:0;index:idx_about_projects_sort"`
	Name        string `gorm:"size:100;not null"`
	URL         string `gorm:"size:255;not null;default:''"`
	Description string `gorm:"size:300"`
	Tags        string `gorm:"size:255"` // 逗号分隔串
	CreatedAt   time.Time
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (AboutProject) TableName() string { return "about_projects" }

// AboutJourney 足迹（#B11-#B13）；time 语义日期（YYYY-M-D），落库 DATE 列，列名 journey_time 避 MySQL 关键字（D8）；
// 读侧固定时间降序，无 sort（#B14 手动排序已废，历史 sort 列残留在库中不再读写）
type AboutJourney struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement"`
	JourneyTime time.Time `gorm:"column:journey_time;type:date;not null"`
	Title       string    `gorm:"size:50;not null"`
	Description string    `gorm:"size:200"`
	Tags        string    `gorm:"size:255"` // 逗号分隔串
	CreatedAt   time.Time
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (AboutJourney) TableName() string { return "about_journeys" }

// AboutContact 联系方式（#B15-#B17，无 sort 列，按 id ASC；icon 不限取值仅长度校验 D7）
type AboutContact struct {
	ID        uint64 `gorm:"primaryKey;autoIncrement"`
	Label     string `gorm:"size:20;not null"`
	Value     string `gorm:"size:100;not null"`
	Icon      string `gorm:"size:20"`
	CreatedAt time.Time
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (AboutContact) TableName() string { return "about_contacts" }
