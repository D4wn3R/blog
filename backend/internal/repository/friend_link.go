package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"github.com/man-mu/blog/backend/internal/model"
)

// ListFriendLinks 全量友链（#F1，D-friend-count：不分页，id ASC）
func (r *Repository) ListFriendLinks(ctx context.Context) ([]model.FriendLink, error) {
	var links []model.FriendLink
	err := r.db.WithContext(ctx).Order("id ASC").Find(&links).Error
	return links, err
}

// GetFriendLinkByID 按主键查友链；不存在返回 (nil, nil)
func (r *Repository) GetFriendLinkByID(ctx context.Context, id uint64) (*model.FriendLink, error) {
	var link model.FriendLink
	err := r.db.WithContext(ctx).First(&link, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &link, nil
}

// ExistsFriendLinkURL url 查重（#F2/#F3 友好前置：无软删语义，直接 count）
func (r *Repository) ExistsFriendLinkURL(ctx context.Context, url string) (bool, error) {
	return r.existsFriendLinkURLWhere(ctx, "url = ?", url)
}

// ExistsFriendLinkURLExcluding url 查重（#F3，排除自身）
func (r *Repository) ExistsFriendLinkURLExcluding(ctx context.Context, url string, id uint64) (bool, error) {
	return r.existsFriendLinkURLWhere(ctx, "url = ? AND id <> ?", url, id)
}

func (r *Repository) existsFriendLinkURLWhere(ctx context.Context, cond string, args ...any) (bool, error) {
	var cnt int64
	if err := r.db.WithContext(ctx).Model(&model.FriendLink{}).Where(cond, args...).Count(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// CreateFriendLink 新增友链；并发窗口下由 uk_friend_links_url 兜底，冲突分类为业务错误
func (r *Repository) CreateFriendLink(ctx context.Context, link *model.FriendLink) error {
	return classifyDup(r.db.WithContext(ctx).Create(link).Error)
}

// UpdateFriendLink 全量更新业务四列（零值列如清空简介也须落库，Select 强制包含）
func (r *Repository) UpdateFriendLink(ctx context.Context, link *model.FriendLink) error {
	return classifyDup(r.db.WithContext(ctx).
		Model(link).Select("name", "url", "description", "image").Updates(link).Error)
}

// DeleteFriendLinkByID 物理删除（#F4：不存在时零行删除，调用方按幂等成功处理）
func (r *Repository) DeleteFriendLinkByID(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Delete(&model.FriendLink{}, id).Error
}
