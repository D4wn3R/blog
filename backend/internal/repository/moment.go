package repository

import (
	"context"
	"errors"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/man-mu/blog/backend/internal/model"
)

// CountMoments 统计显示中动态总数（#M1 分页 total）
func (r *Repository) CountMoments(ctx context.Context) (int64, error) {
	var cnt int64
	err := r.db.WithContext(ctx).Model(&model.Moment{}).
		Where("status = ?", model.MomentStatusVisible).
		Count(&cnt).Error
	return cnt, err
}

// ListMoments 分页取显示中动态（#M1）：status=1 + created_at DESC, id DESC，
// 走 idx_moments_status_created
func (r *Repository) ListMoments(ctx context.Context, offset, limit int) ([]model.Moment, error) {
	moments := make([]model.Moment, 0, limit)
	err := r.db.WithContext(ctx).Model(&model.Moment{}).
		Where("status = ?", model.MomentStatusVisible).
		Order("created_at DESC, id DESC").
		Offset(offset).Limit(limit).
		Find(&moments).Error
	return moments, err
}

// CreateMoment 插入动态（落库即显示，无草稿态）；images 由 service 恒显式传 "[]"（schema §7.3 禁 NULL）
func (r *Repository) CreateMoment(ctx context.Context, moment *model.Moment) error {
	return r.db.WithContext(ctx).Create(moment).Error
}

// GetMomentByID 按主键查动态；不存在返回 (nil, nil)
func (r *Repository) GetMomentByID(ctx context.Context, id uint64) (*model.Moment, error) {
	var moment model.Moment
	err := r.db.WithContext(ctx).Take(&moment, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &moment, nil
}

// UpdateMoment 全量替换（#M3 PUT）：仅动 content/images 两列，status/created_at 不变
func (r *Repository) UpdateMoment(ctx context.Context, id uint64, content string, images datatypes.JSON) error {
	return r.db.WithContext(ctx).Model(&model.Moment{}).
		Where("id = ?", id).
		Updates(map[string]any{"content": content, "images": images}).Error
}

// DeleteMoment 物理删除（#M4，D-moment-del）：无外部引用，不存在时零行删除天然幂等
func (r *Repository) DeleteMoment(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Delete(&model.Moment{}, id).Error
}
