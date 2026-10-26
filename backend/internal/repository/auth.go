package repository

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"

	"github.com/man-mu/blog/backend/internal/model"
	"github.com/man-mu/blog/backend/internal/pkg/randx"
)

// 唯一索引冲突（MySQL 1062）按业务语义分类：并发正确性由唯一索引兜底（spec 总则 2），
// 应用层只负责把冲突翻译成语义化错误，供 service 分支处理竞态
var (
	// ErrDupProviderBinding uk_provider_pid：(provider, provider_id) 已被绑定
	ErrDupProviderBinding = errors.New("该第三方账号已被绑定")
	// ErrDupUserBinding uk_user_provider：该用户已绑定该平台
	ErrDupUserBinding = errors.New("该用户已绑定该平台")
	// ErrDupUsername users.username 唯一索引冲突
	ErrDupUsername = errors.New("用户名已存在")
	// ErrDupSlug uk_articles_slug：文章 slug 已被占用
	ErrDupSlug = errors.New("slug 已被占用")
	// ErrDupCategoryName uk_categories_name：分类名已存在
	ErrDupCategoryName = errors.New("分类名已存在")
	// ErrDupTagName uk_tags_name：标签名已存在
	ErrDupTagName = errors.New("标签名已存在")
	// ErrDupFriendURL uk_friend_links_url：友链地址已存在
	ErrDupFriendURL = errors.New("该链接地址已存在")
)

// 解绑事务的业务结果（spec §4 #9）
var (
	// ErrNotBound 未绑定该平台
	ErrNotBound = errors.New("未绑定该平台")
	// ErrLastBinding 最后一个绑定，不可解绑
	ErrLastBinding = errors.New("至少保留一个登录方式")
)

// GetUserByID 按主键查用户；不存在返回 (nil, nil)
func (r *Repository) GetUserByID(ctx context.Context, id uint64) (*model.User, error) {
	var user model.User
	err := r.db.WithContext(ctx).First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// ExistsUsername 用户名是否已被占用（建号查重用）
func (r *Repository) ExistsUsername(ctx context.Context, username string) (bool, error) {
	var cnt int64
	if err := r.db.WithContext(ctx).Model(&model.User{}).Where("username = ?", username).Count(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// GetUserByProvider 查 (provider, provider_id) 绑定的用户；未绑定返回 (nil, nil)
func (r *Repository) GetUserByProvider(ctx context.Context, provider, providerID string) (*model.User, error) {
	var acc model.OAuthAccount
	err := r.db.WithContext(ctx).Where("provider = ? AND provider_id = ?", provider, providerID).First(&acc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r.GetUserByID(ctx, acc.UserID)
}

// SyncUserProfileFromOAuth 登录命中已有绑定时，把第三方平台最新资料同步到 users：
// seed 预建的账号（-migrate 建号，不经过建号流程）从未写过头像/邮箱，靠每次登录补齐。
// users 表无 nickname 列（展示名即 username，不随平台改）；空值不覆盖；
// 无值可写则零操作，天然幂等
func (r *Repository) SyncUserProfileFromOAuth(ctx context.Context, userID uint64, avatar, email string) error {
	updates := map[string]any{}
	if avatar != "" {
		updates["avatar"] = avatar
	}
	if email != "" {
		updates["email"] = email
	}
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", userID).Updates(updates).Error
}

// CreateUserWithAccount 事务建号：users 与 oauth_accounts 同生共死，user.ID 落库后回填；
// 唯一索引冲突分类为业务错误返回
func (r *Repository) CreateUserWithAccount(ctx context.Context, user *model.User, account *model.OAuthAccount) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		account.UserID = user.ID
		return tx.Create(account).Error
	})
	return classifyDup(err)
}

// GetOAuthAccountByProviderID 按 (provider, provider_id) 查绑定记录；不存在返回 (nil, nil)
func (r *Repository) GetOAuthAccountByProviderID(ctx context.Context, provider, providerID string) (*model.OAuthAccount, error) {
	var acc model.OAuthAccount
	err := r.db.WithContext(ctx).Where("provider = ? AND provider_id = ?", provider, providerID).First(&acc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &acc, nil
}

// GetUserOAuthAccount 按 (user_id, provider) 查绑定记录；不存在返回 (nil, nil)
func (r *Repository) GetUserOAuthAccount(ctx context.Context, userID uint64, provider string) (*model.OAuthAccount, error) {
	var acc model.OAuthAccount
	err := r.db.WithContext(ctx).Where("user_id = ? AND provider = ?", userID, provider).First(&acc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &acc, nil
}

// CreateOAuthAccount 插入绑定记录，唯一索引冲突分类为业务错误返回
func (r *Repository) CreateOAuthAccount(ctx context.Context, account *model.OAuthAccount) error {
	return classifyDup(r.db.WithContext(ctx).Create(account).Error)
}

// ListOAuthAccountsByUser 查用户全部绑定记录（/me 绑定列表用）
func (r *Repository) ListOAuthAccountsByUser(ctx context.Context, userID uint64) ([]model.OAuthAccount, error) {
	var accounts []model.OAuthAccount
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("id").Find(&accounts).Error
	return accounts, err
}

// UnbindOAuthAccount 事务 + 行锁解绑（spec §4 #9）：
// 先锁 users 行（该用户所有解绑操作在此串行化，固定先 users 后 oauth_accounts 零死锁），
// FOR UPDATE 当前读确保 COUNT 看到并发事务提交后的真实值，绕开 REPEATABLE READ 快照陷阱
func (r *Repository) UnbindOAuthAccount(ctx context.Context, userID uint64, provider string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 锁 users 行：该用户所有解绑操作在此串行化
		if err := tx.Exec("SELECT id FROM users WHERE id = ? FOR UPDATE", userID).Error; err != nil {
			return err
		}
		// 未绑定该平台
		var acc model.OAuthAccount
		err := tx.Where("user_id = ? AND provider = ?", userID, provider).First(&acc).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotBound
		}
		if err != nil {
			return err
		}
		// 至少保留一个登录方式，防解绑成幽灵号
		var cnt int64
		if err := tx.Model(&model.OAuthAccount{}).Where("user_id = ?", userID).Count(&cnt).Error; err != nil {
			return err
		}
		if cnt < 2 {
			return ErrLastBinding
		}
		// 物理删除（恢复绑定 = 重新授权重插，语义等价）
		return tx.Delete(&acc).Error
	})
}

// SeedAdmin 幂等初始化管理员（-migrate 时调用，spec §8）：
// githubID 为 0 视为未配置，跳过 seed；
// 已有 (provider, provider_id) 绑定 → 提权该用户为 admin（若为 user）；
// 无记录 → 插入 admin 用户 + 对应平台绑定（此后该平台首次登录直接命中绑定，以 admin 身份进入）
func (r *Repository) SeedAdmin(ctx context.Context, githubID uint64) error {
	if githubID != 0 {
		return r.seedAdminByBinding(ctx, "github", strconv.FormatUint(githubID, 10))
	}
	return nil
}

// seedAdminByBinding 按 (provider, provider_id) 绑定幂等初始化管理员
func (r *Repository) seedAdminByBinding(ctx context.Context, provider, providerID string) error {
	var acc model.OAuthAccount
	err := r.db.WithContext(ctx).Where("provider = ? AND provider_id = ?", provider, providerID).First(&acc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return r.createAdminUser(ctx, provider, providerID)
	}
	if err != nil {
		return err
	}
	// 已绑定：提权为 admin（已是 admin 则零行更新，天然幂等）
	return r.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ? AND role = ?", acc.UserID, model.RoleUser).
		Update("role", model.RoleAdmin).Error
}

// createAdminUser 插入 admin 用户 + 平台绑定；username "admin" 被占用时追加 4 位随机 hex 后缀重试
func (r *Repository) createAdminUser(ctx context.Context, provider, providerID string) error {
	username := "admin"
	var err error
	for attempt := 0; attempt < 5; attempt++ {
		user := &model.User{Username: username, Role: model.RoleAdmin, Status: model.UserStatusNormal}
		account := &model.OAuthAccount{Provider: provider, ProviderID: providerID}
		err = classifyDup(r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(user).Error; err != nil {
				return err
			}
			account.UserID = user.ID
			return tx.Create(account).Error
		}))
		if err == nil {
			return nil
		}
		if !errors.Is(err, ErrDupUsername) {
			return err
		}
		username = "admin_" + randx.Hex(4)
	}
	return err
}

// classifyDup 将 MySQL 1062 唯一索引冲突映射为业务错误，其余错误原样透传
func classifyDup(err error) error {
	if err == nil {
		return nil
	}
	var me *mysql.MySQLError
	if !errors.As(err, &me) || me.Number != 1062 {
		return err
	}
	switch key := dupKeyName(me); {
	case strings.Contains(key, "uk_provider_pid"):
		return fmt.Errorf("%w: %w", ErrDupProviderBinding, err)
	case strings.Contains(key, "uk_user_provider"):
		return fmt.Errorf("%w: %w", ErrDupUserBinding, err)
	case strings.Contains(key, "uk_articles_slug"):
		return fmt.Errorf("%w: %w", ErrDupSlug, err)
	case strings.Contains(key, "uk_categories_name"):
		return fmt.Errorf("%w: %w", ErrDupCategoryName, err)
	case strings.Contains(key, "uk_tags_name"):
		return fmt.Errorf("%w: %w", ErrDupTagName, err)
	case strings.Contains(key, "uk_friend_links_url"):
		return fmt.Errorf("%w: %w", ErrDupFriendURL, err)
	case strings.Contains(key, "username"):
		return fmt.Errorf("%w: %w", ErrDupUsername, err)
	}
	return err
}

// dupKeyName 从 1062 错误信息中提取命中的索引名
// （MySQL 8 形如 "Duplicate entry 'x' for key 'oauth_accounts.uk_provider_pid'"，5.x 无表名前缀）
func dupKeyName(me *mysql.MySQLError) string {
	const marker = "for key '"
	i := strings.Index(me.Message, marker)
	if i < 0 {
		return ""
	}
	rest := me.Message[i+len(marker):]
	if j := strings.IndexByte(rest, '\''); j >= 0 {
		return rest[:j]
	}
	return rest
}
