package repository

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"

	"github.com/D4wn3R/blog/backend/internal/model"
	"github.com/D4wn3R/blog/backend/internal/pkg/randx"
)

// 唯一索引冲突（MySQL 1062）按业务语义分类：并发正确性由唯一索引兜底（spec 总则 2），
// 应用层只负责把冲突翻译成语义化错误，供 service 分支处理竞态
var (
	// ErrDupGitHubBinding uk_oauth_accounts_github_id：该 GitHub 账号已被绑定
	ErrDupGitHubBinding = errors.New("该 GitHub 账号已被绑定")
	// ErrDupUserBinding uk_oauth_accounts_user_id：该用户已绑定 GitHub（站点唯一登录方式）
	ErrDupUserBinding = errors.New("该用户已绑定 GitHub 账号")
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

// GetUserByGitHubID 查 github_id 绑定的用户；未绑定返回 (nil, nil)
func (r *Repository) GetUserByGitHubID(ctx context.Context, githubID string) (*model.User, error) {
	var acc model.OAuthAccount
	err := r.db.WithContext(ctx).Where("github_id = ?", githubID).First(&acc).Error
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

// GetOAuthAccountByGitHubID 按 github_id 查绑定记录；不存在返回 (nil, nil)
func (r *Repository) GetOAuthAccountByGitHubID(ctx context.Context, githubID string) (*model.OAuthAccount, error) {
	var acc model.OAuthAccount
	err := r.db.WithContext(ctx).Where("github_id = ?", githubID).First(&acc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &acc, nil
}

// GetUserGitHubAccount 按 user_id 查绑定记录（一个用户至多一条）；不存在返回 (nil, nil)
func (r *Repository) GetUserGitHubAccount(ctx context.Context, userID uint64) (*model.OAuthAccount, error) {
	var acc model.OAuthAccount
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&acc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &acc, nil
}

// CreateGitHubAccount 插入绑定记录，唯一索引冲突分类为业务错误返回
func (r *Repository) CreateGitHubAccount(ctx context.Context, account *model.OAuthAccount) error {
	return classifyDup(r.db.WithContext(ctx).Create(account).Error)
}

// ListOAuthAccountsByUser 查用户全部绑定记录（/me 绑定列表用）
func (r *Repository) ListOAuthAccountsByUser(ctx context.Context, userID uint64) ([]model.OAuthAccount, error) {
	var accounts []model.OAuthAccount
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("id").Find(&accounts).Error
	return accounts, err
}

// UnbindGitHubAccount 事务 + 行锁解绑（spec §4 #9）：
// 先锁 users 行（该用户所有解绑操作在此串行化，固定先 users 后 oauth_accounts 零死锁），
// FOR UPDATE 当前读确保 COUNT 看到并发事务提交后的真实值，绕开 REPEATABLE READ 快照陷阱。
// GitHub 是唯一登录方式，正常用户必被"至少保留一个登录方式"拦下；保留该语义以防未来放开多登录方式
func (r *Repository) UnbindGitHubAccount(ctx context.Context, userID uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 锁 users 行：该用户所有解绑操作在此串行化
		if err := tx.Exec("SELECT id FROM users WHERE id = ? FOR UPDATE", userID).Error; err != nil {
			return err
		}
		// 未绑定 GitHub
		var acc model.OAuthAccount
		err := tx.Where("user_id = ?", userID).First(&acc).Error
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
// 已有 github_id 绑定 → 提权该用户为 admin（若为 user）；
// 无记录 → 插入 admin 用户 + GitHub 绑定（此后 GitHub 首次登录直接命中绑定，以 admin 身份进入）
func (r *Repository) SeedAdmin(ctx context.Context, githubID uint64) error {
	if githubID == 0 {
		return nil
	}
	return r.seedAdminByGitHubID(ctx, strconv.FormatUint(githubID, 10))
}

// seedAdminByGitHubID 按 github_id 绑定幂等初始化管理员
func (r *Repository) seedAdminByGitHubID(ctx context.Context, githubID string) error {
	var acc model.OAuthAccount
	err := r.db.WithContext(ctx).Where("github_id = ?", githubID).First(&acc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return r.createAdminUser(ctx, githubID)
	}
	if err != nil {
		return err
	}
	// 已绑定：提权为 admin（已是 admin 则零行更新，天然幂等）
	return r.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ? AND role = ?", acc.UserID, model.RoleUser).
		Update("role", model.RoleAdmin).Error
}

// createAdminUser 插入 admin 用户 + GitHub 绑定；username "admin" 被占用时追加 4 位随机 hex 后缀重试
func (r *Repository) createAdminUser(ctx context.Context, githubID string) error {
	username := "admin"
	var err error
	for attempt := 0; attempt < 5; attempt++ {
		user := &model.User{Username: username, Role: model.RoleAdmin, Status: model.UserStatusNormal}
		account := &model.OAuthAccount{GitHubID: githubID}
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
	case strings.Contains(key, "uk_oauth_accounts_github_id"):
		return fmt.Errorf("%w: %w", ErrDupGitHubBinding, err)
	case strings.Contains(key, "uk_oauth_accounts_user_id"):
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
// （MySQL 8 形如 "Duplicate entry 'x' for key 'oauth_accounts.uk_oauth_accounts_github_id'"，5.x 无表名前缀）
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
