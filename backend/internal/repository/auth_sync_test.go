package repository

// 一次性验证：SyncUserProfileFromOAuth 对 seed 账号的补齐行为（跑完即删）
// 用法：本地 MySQL 在跑时 go test ./internal/repository -run TestSyncUserProfileFromOAuth

import (
	"context"
	"os"
	"testing"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/man-mu/blog/backend/internal/model"
)

// newTestDB 连接独立测试库（默认 blog_test，可用 BLOG_TEST_DSN 覆盖），
// 每个测试自建自清 User 表，不碰业务库
func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("BLOG_TEST_DSN")
	if dsn == "" {
		dsn = "root:123456@tcp(127.0.0.1:3306)/blog_test?charset=utf8mb4&parseTime=True&loc=Asia%2FShanghai"
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Skipf("测试库不可用（跳过）: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Migrator().DropTable(&model.User{}); err != nil {
			t.Logf("cleanup: %v", err)
		}
	})
	return db
}

func TestSyncUserProfileFromOAuth(t *testing.T) {
	db := newTestDB(t)
	r := New(db)
	ctx := context.Background()

	// seed 风格账号：avatar/email 为空（未经过建号流程）
	user := &model.User{Username: "seed-admin", Role: model.RoleAdmin, Status: model.UserStatusNormal}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	// 空值不写：零操作
	if err := r.SyncUserProfileFromOAuth(ctx, user.ID, "", ""); err != nil {
		t.Fatalf("empty sync should be no-op: %v", err)
	}

	// 同步 GitHub 头像与邮箱
	if err := r.SyncUserProfileFromOAuth(ctx, user.ID, "https://avatars.githubusercontent.com/u/1?v=4", "test@example.com"); err != nil {
		t.Fatalf("sync: %v", err)
	}
	var got model.User
	if err := db.First(&got, user.ID).Error; err != nil {
		t.Fatalf("reload: %v", err)
	}
	if got.Avatar != "https://avatars.githubusercontent.com/u/1?v=4" {
		t.Errorf("avatar not synced: %q", got.Avatar)
	}
	if got.Email != "test@example.com" {
		t.Errorf("email not synced: %q", got.Email)
	}

	// 幂等：重复同步同值零变化
	if err := r.SyncUserProfileFromOAuth(ctx, user.ID, "https://avatars.githubusercontent.com/u/1?v=4", "test@example.com"); err != nil {
		t.Fatalf("idempotent sync: %v", err)
	}
	var again model.User
	if err := db.First(&again, user.ID).Error; err != nil {
		t.Fatalf("reload 2: %v", err)
	}
	if again.Avatar != got.Avatar || again.Email != got.Email {
		t.Errorf("idempotent sync changed values: %+v vs %+v", again, got)
	}
}
