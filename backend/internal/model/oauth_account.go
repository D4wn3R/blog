package model

import "time"

// OAuthAccount 第三方登录关联表：站点只接入 GitHub，一个用户至多一个 GitHub 账号。
// 双唯一索引各管一个方向：
//
//	uk_oauth_accounts_github_id 同一 GitHub 账号只能绑一个用户
//	uk_oauth_accounts_user_id   同一用户只能绑一个 GitHub 账号
//
// 应用层 check-then-insert 仅供友好文案，并发正确性由这两条索引兜底。
// 列名显式钉死为 github_id：GORM 默认蛇形转换会把 GitHubID 拆成 git_hub_id（历史漂移来源）
type OAuthAccount struct {
	ID        uint64 `gorm:"primaryKey;autoIncrement"`
	UserID    uint64 `gorm:"not null;uniqueIndex:uk_oauth_accounts_user_id"`
	GitHubID  string `gorm:"column:github_id;size:64;not null;uniqueIndex:uk_oauth_accounts_github_id"` // GitHub 用户 id
	Nickname  string `gorm:"size:50"`                                                                   // GitHub 昵称快照
	Avatar    string `gorm:"size:255"`                                                                  // GitHub 头像快照
	CreatedAt time.Time

	User *User `gorm:"foreignKey:UserID"`
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (OAuthAccount) TableName() string { return "oauth_accounts" }
