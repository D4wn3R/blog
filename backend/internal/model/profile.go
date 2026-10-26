package model

// Profile 个人简介表（单行，id 恒为 1，D-profile-3-fields 三列收缩，无时间列；头像走 site_settings）
type Profile struct {
	ID       uint8  `gorm:"primaryKey"`
	Nickname string `gorm:"size:50"`
	TitleEn  string `gorm:"size:100"` // 英文标题（关于页/B 端资料卡）
	Bio      string `gorm:"size:200"`
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (Profile) TableName() string { return "profile" }
