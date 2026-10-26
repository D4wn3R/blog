package model

import "time"

// 用户角色
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

// 用户状态
const (
	UserStatusNormal = 0
	UserStatusBanned = 1
)

// User 用户表
type User struct {
	ID           uint64 `gorm:"primaryKey;autoIncrement"`
	Username     string `gorm:"size:50;uniqueIndex;not null"` // 展示名
	PasswordHash string `gorm:"size:255"`                     // 预留账密登录，第三方登录为空
	Email        string `gorm:"size:100"`
	Avatar       string `gorm:"size:255"`
	Role         string `gorm:"size:10;not null;default:user"`
	Status       int8   `gorm:"not null;default:0"`
	CreatedAt    time.Time
	UpdatedAt    time.Time

	OAuthAccounts []OAuthAccount `gorm:"foreignKey:UserID"`
}

// TableName GORM 表名（复数蛇形，显式钉死防重构改名漂移）
func (User) TableName() string { return "users" }
