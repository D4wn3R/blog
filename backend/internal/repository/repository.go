package repository

import "gorm.io/gorm"

// Repository 数据访问层，事务边界在 service 与本层
type Repository struct {
	db *gorm.DB
}

// New 构造数据访问层
func New(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// DB 暴露底层 GORM 句柄（迁移与探针用）
func (r *Repository) DB() *gorm.DB {
	return r.db
}
