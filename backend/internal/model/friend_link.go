package model

import "time"

// FriendLink 友链表（精简版：仅业务字段 name/description/url/image）
type FriendLink struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	Name        string `gorm:"size:50;not null"` // 重名无害
	URL         string `gorm:"size:255;not null;uniqueIndex:uk_friend_links_url"`
	Description string `gorm:"column:description;size:200;not null;default:''"`
	Image       string `gorm:"size:255"`
	CreatedAt   time.Time
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (FriendLink) TableName() string { return "friend_links" }
