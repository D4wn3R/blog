package model

import "time"

// OAuthAccount 第三方登录关联表，一个用户可绑定多个第三方（每平台至多一个）
// 双唯一索引各管一个方向：
//
//	uk_provider_pid  (provider, provider_id)  同一平台账号只能绑一个用户
//	uk_user_provider (user_id, provider)      同一用户每平台只能绑一个账号
//
// 应用层 check-then-insert 仅供友好文案，并发正确性由这两条索引兜底
type OAuthAccount struct {
	ID         uint64 `gorm:"primaryKey;autoIncrement"`
	UserID     uint64 `gorm:"not null;uniqueIndex:uk_user_provider"`
	Provider   string `gorm:"size:20;not null;uniqueIndex:uk_provider_pid;uniqueIndex:uk_user_provider"` // 'github'
	ProviderID string `gorm:"size:64;not null;uniqueIndex:uk_provider_pid"`                              // GitHub 用户 id
	Nickname   string `gorm:"size:50"`                                                                   // 第三方昵称快照
	Avatar     string `gorm:"size:255"`                                                                  // 第三方头像快照
	CreatedAt  time.Time

	User *User `gorm:"foreignKey:UserID"`
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (OAuthAccount) TableName() string { return "oauth_accounts" }
