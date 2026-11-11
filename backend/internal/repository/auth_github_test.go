// GitHub-only OAuth 数据层回归：约束、查询、seed 与解绑语义。
// 需要隔离 MySQL（BLOG_TEST_DSN），每个用例自建一次性 schema 并在结束时销毁
package repository

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/go-sql-driver/mysql"
	gormmysql "gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/D4wn3R/blog/backend/internal/model"
	"github.com/D4wn3R/blog/backend/internal/pkg/randx"
)

// newGitHubTestDB 在 BLOG_TEST_DSN 指向的实例上新建一次性 schema，建出 User/OAuthAccount 表
func newGitHubTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	raw := os.Getenv("BLOG_TEST_DSN")
	if raw == "" {
		t.Skip("未设置 BLOG_TEST_DSN，跳过需要 MySQL 的 GitHub-only 数据层测试")
	}
	cfg, err := mysql.ParseDSN(raw)
	if err != nil {
		t.Fatalf("解析 BLOG_TEST_DSN: %v", err)
	}
	cfg.ParseTime = true
	admin, err := gorm.Open(gormmysql.Open(cfg.FormatDSN()), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接 MySQL: %v", err)
	}
	name := "blog_fix_repo_" + randx.Hex(6)
	if err := admin.Exec("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4").Error; err != nil {
		t.Fatalf("创建临时 schema: %v", err)
	}
	t.Cleanup(func() {
		if err := admin.Exec("DROP DATABASE IF EXISTS `" + name + "`").Error; err != nil {
			t.Logf("清理临时 schema %s: %v", name, err)
		}
	})
	cfg.DBName = name
	db, err := gorm.Open(gormmysql.Open(cfg.FormatDSN()), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接临时 schema: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.OAuthAccount{}); err != nil {
		t.Fatalf("建表: %v", err)
	}
	return db
}

// createUser 建一个普通用户（无绑定）
func createUser(t *testing.T, db *gorm.DB, username string) *model.User {
	t.Helper()
	user := &model.User{Username: username, Role: model.RoleUser, Status: model.UserStatusNormal}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("建用户 %s: %v", username, err)
	}
	return user
}

func TestCreateGitHubAccountUniqueConstraints(t *testing.T) {
	db := newGitHubTestDB(t)
	r := New(db)
	ctx := context.Background()

	alice := createUser(t, db, "alice")
	bob := createUser(t, db, "bob")

	if err := r.CreateGitHubAccount(ctx, &model.OAuthAccount{UserID: alice.ID, GitHubID: "1001"}); err != nil {
		t.Fatalf("首次绑定: %v", err)
	}

	// 同一个 GitHub ID 只能绑一个用户
	err := r.CreateGitHubAccount(ctx, &model.OAuthAccount{UserID: bob.ID, GitHubID: "1001"})
	if !errors.Is(err, ErrDupGitHubBinding) {
		t.Errorf("重复 GitHub ID 错误 = %v，期望 ErrDupGitHubBinding", err)
	}

	// 同一个用户只能绑一个 GitHub 账号
	err = r.CreateGitHubAccount(ctx, &model.OAuthAccount{UserID: alice.ID, GitHubID: "1002"})
	if !errors.Is(err, ErrDupUserBinding) {
		t.Errorf("重复 user_id 错误 = %v，期望 ErrDupUserBinding", err)
	}
}

func TestGetGitHubBindings(t *testing.T) {
	db := newGitHubTestDB(t)
	r := New(db)
	ctx := context.Background()

	ghost, err := r.GetUserByGitHubID(ctx, "4040")
	if err != nil || ghost != nil {
		t.Fatalf("未绑定查询 = (%v, %v)，期望 (nil, nil)", ghost, err)
	}

	alice := createUser(t, db, "alice")
	if err := r.CreateGitHubAccount(ctx, &model.OAuthAccount{
		UserID: alice.ID, GitHubID: "1001", Nickname: "alice-gh", Avatar: "https://a.example/1",
	}); err != nil {
		t.Fatalf("绑定: %v", err)
	}

	got, err := r.GetUserByGitHubID(ctx, "1001")
	if err != nil {
		t.Fatalf("按 GitHub ID 查用户: %v", err)
	}
	if got == nil || got.ID != alice.ID {
		t.Fatalf("按 GitHub ID 查用户 = %+v，期望 id=%d", got, alice.ID)
	}

	acc, err := r.GetOAuthAccountByGitHubID(ctx, "1001")
	if err != nil {
		t.Fatalf("按 GitHub ID 查绑定: %v", err)
	}
	if acc == nil || acc.Nickname != "alice-gh" || acc.Avatar != "https://a.example/1" {
		t.Fatalf("绑定快照 = %+v", acc)
	}

	own, err := r.GetUserGitHubAccount(ctx, alice.ID)
	if err != nil {
		t.Fatalf("按用户查绑定: %v", err)
	}
	if own == nil || own.GitHubID != "1001" {
		t.Fatalf("按用户查绑定 = %+v", own)
	}

	none, err := r.GetUserGitHubAccount(ctx, 999999)
	if err != nil || none != nil {
		t.Fatalf("无绑定用户查询 = (%v, %v)，期望 (nil, nil)", none, err)
	}
}

func TestUnbindGitHubAccount(t *testing.T) {
	db := newGitHubTestDB(t)
	r := New(db)
	ctx := context.Background()

	alice := createUser(t, db, "alice")

	// 未绑定 → ErrNotBound
	if err := r.UnbindGitHubAccount(ctx, alice.ID); !errors.Is(err, ErrNotBound) {
		t.Errorf("未绑定解绑错误 = %v，期望 ErrNotBound", err)
	}

	if err := r.CreateGitHubAccount(ctx, &model.OAuthAccount{UserID: alice.ID, GitHubID: "1001"}); err != nil {
		t.Fatalf("绑定: %v", err)
	}
	// GitHub 是唯一登录方式：唯一绑定即最后一个，解绑必须被拒（防幽灵号）
	if err := r.UnbindGitHubAccount(ctx, alice.ID); !errors.Is(err, ErrLastBinding) {
		t.Errorf("解绑唯一登录方式错误 = %v，期望 ErrLastBinding", err)
	}
	var cnt int64
	if err := db.Model(&model.OAuthAccount{}).Where("user_id = ?", alice.ID).Count(&cnt).Error; err != nil {
		t.Fatalf("解绑失败后计数: %v", err)
	}
	if cnt != 1 {
		t.Errorf("解绑被拒后绑定行数 = %d，期望 1", cnt)
	}
}

func TestSeedAdminIdempotent(t *testing.T) {
	db := newGitHubTestDB(t)
	r := New(db)
	ctx := context.Background()

	// githubID 未配置（0）→ 零操作
	if err := r.SeedAdmin(ctx, 0); err != nil {
		t.Fatalf("空 seed: %v", err)
	}
	var cnt int64
	if err := db.Model(&model.User{}).Count(&cnt).Error; err != nil {
		t.Fatalf("空 seed 计数: %v", err)
	}
	if cnt != 0 {
		t.Fatalf("githubID=0 不应建号，实际 %d 行", cnt)
	}

	// 首次 seed 建 admin + 绑定
	if err := r.SeedAdmin(ctx, 1001); err != nil {
		t.Fatalf("首次 seed: %v", err)
	}
	// 重复 seed 幂等：不增行，仍是 admin
	if err := r.SeedAdmin(ctx, 1001); err != nil {
		t.Fatalf("重复 seed: %v", err)
	}
	var users int64
	if err := db.Model(&model.User{}).Count(&users).Error; err != nil {
		t.Fatalf("seed 后用户数: %v", err)
	}
	if users != 1 {
		t.Errorf("幂等 seed 后用户数 = %d，期望 1", users)
	}
	var acc model.OAuthAccount
	if err := db.Where("github_id = ?", "1001").First(&acc).Error; err != nil {
		t.Fatalf("seed 绑定: %v", err)
	}
	var admin model.User
	if err := db.First(&admin, acc.UserID).Error; err != nil {
		t.Fatalf("读 admin: %v", err)
	}
	if admin.Role != model.RoleAdmin {
		t.Errorf("seed 用户角色 = %q，期望 %q", admin.Role, model.RoleAdmin)
	}

	// 已存在的普通用户被 seed：提权而不是新建
	bob := createUser(t, db, "bob")
	if err := r.CreateGitHubAccount(ctx, &model.OAuthAccount{UserID: bob.ID, GitHubID: "2002"}); err != nil {
		t.Fatalf("绑定 bob: %v", err)
	}
	if err := r.SeedAdmin(ctx, 2002); err != nil {
		t.Fatalf("seed 提权: %v", err)
	}
	var promoted model.User
	if err := db.First(&promoted, bob.ID).Error; err != nil {
		t.Fatalf("读 bob: %v", err)
	}
	if promoted.Role != model.RoleAdmin {
		t.Errorf("seed 后 bob 角色 = %q，期望 %q", promoted.Role, model.RoleAdmin)
	}
	if err := db.Model(&model.User{}).Count(&users).Error; err != nil {
		t.Fatalf("提权后用户数: %v", err)
	}
	if users != 2 {
		t.Errorf("提权不应新建用户，实际 %d 行", users)
	}
}
