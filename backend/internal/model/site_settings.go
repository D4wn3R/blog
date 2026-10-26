package model

// SiteSetting 站点设置 KV 表（D6=B 单行键值，#B18 白名单 8 键（含 site_title）：
// hero_prefix/hero_accent/hero_tagline/site_name/site_url/site_desc/site_image）
type SiteSetting struct {
	Key   string `gorm:"column:key;primaryKey;size:50"`
	Value string `gorm:"column:value;size:500;not null;default:''"`
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (SiteSetting) TableName() string { return "site_settings" }
