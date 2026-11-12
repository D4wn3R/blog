// GitHub-only schema 收敛的集成测试：只在隔离库跑（BLOG_TEST_DSN 指向的服务器 + 每次新建的临时 schema）。
// 缺省无 DSN 时整组 skip，绝不复用业务库或默认 blog_test 做破坏性 DDL。
package main

import (
	"os"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"
	gormmysql "gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/D4wn3R/blog/backend/internal/model"
	"github.com/D4wn3R/blog/backend/internal/pkg/randx"
)

// newMigrateTestDB 在 BLOG_TEST_DSN 指向的 MySQL 实例上新建一次性 schema，测试结束销毁。
// 返回空库（表由各用例自建），确保迁移逻辑面对的是真实旧物理 schema
func newMigrateTestDB(t *testing.T) (*gorm.DB, string) {
	t.Helper()
	raw := os.Getenv("BLOG_TEST_DSN")
	if raw == "" {
		t.Skip("未设置 BLOG_TEST_DSN，跳过需要 MySQL 的 schema 迁移集成测试")
	}
	cfg, err := mysql.ParseDSN(raw)
	if err != nil {
		t.Fatalf("解析 BLOG_TEST_DSN: %v", err)
	}
	cfg.ParseTime = true
	admin := openDSN(t, cfg.FormatDSN())
	name := "blog_fix_migrate_" + randx.Hex(6)
	if err := admin.Exec("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4").Error; err != nil {
		t.Fatalf("创建临时 schema %s: %v", name, err)
	}
	t.Cleanup(func() {
		if err := admin.Exec("DROP DATABASE IF EXISTS `" + name + "`").Error; err != nil {
			t.Logf("清理临时 schema %s: %v", name, err)
		}
	})

	cfg.DBName = name
	return openDSN(t, cfg.FormatDSN()), name
}

// openDSN 打开到指定 DSN 的连接；失败即 Fatal
func openDSN(t *testing.T, dsn string) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(gormmysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接 MySQL: %v", err)
	}
	return db
}

// createLegacySchema 建出线上旧形状：provider 双唯一索引、union_id、users.git_hub_id、
// about_journeys.sort 全在。withProviderUniques=false 模拟"旧唯一索引已被外部删掉"的漂移库
// （重复数据只有在去掉这两条索引后才可能落库）
func createLegacySchema(t *testing.T, db *gorm.DB, withProviderUniques bool) {
	t.Helper()
	stmts := []string{
		"CREATE TABLE users (" +
			"id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
			"username VARCHAR(50) NOT NULL," +
			"password_hash VARCHAR(255) NULL," +
			"email VARCHAR(100) NULL," +
			"avatar VARCHAR(255) NULL," +
			"role VARCHAR(10) NOT NULL DEFAULT 'user'," +
			"status TINYINT NOT NULL DEFAULT 0," +
			"git_hub_id VARCHAR(64) NULL," +
			"created_at DATETIME(3) NULL," +
			"updated_at DATETIME(3) NULL," +
			"PRIMARY KEY (id)," +
			"UNIQUE KEY idx_users_username (username)," +
			"KEY idx_users_git_hub_id (git_hub_id)" +
			") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
		"CREATE TABLE oauth_accounts (" +
			"id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
			"user_id BIGINT UNSIGNED NOT NULL," +
			"provider VARCHAR(20) NOT NULL," +
			"provider_id VARCHAR(64) NOT NULL," +
			"union_id VARCHAR(64) NULL," +
			"nickname VARCHAR(50) NULL," +
			"avatar VARCHAR(255) NULL," +
			"created_at DATETIME(3) NULL," +
			"PRIMARY KEY (id)" +
			") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
		"CREATE TABLE about_journeys (" +
			"id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
			"journey_time DATE NOT NULL," +
			"title VARCHAR(50) NOT NULL," +
			"description VARCHAR(200) NULL," +
			"tags VARCHAR(255) NULL," +
			"sort INT NOT NULL DEFAULT 0," +
			"created_at DATETIME(3) NULL," +
			"PRIMARY KEY (id)," +
			"KEY idx_about_journeys_sort (sort)" +
			") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
		"ALTER TABLE oauth_accounts ADD CONSTRAINT fk_users_o_auth_accounts " +
			"FOREIGN KEY (user_id) REFERENCES users (id)",
	}
	if withProviderUniques {
		stmts = append(stmts,
			"ALTER TABLE oauth_accounts ADD UNIQUE KEY uk_provider_pid (provider, provider_id)",
			"ALTER TABLE oauth_accounts ADD UNIQUE KEY uk_user_provider (user_id, provider)",
		)
	}
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("建旧 schema: %v (%s)", err, stmt)
		}
	}
}

// execAll 顺序执行用例数据语句
func execAll(t *testing.T, db *gorm.DB, stmts []string) {
	t.Helper()
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("准备数据: %v (%s)", err, stmt)
		}
	}
}

// _githubAccounts 代表性历史数据：三条 GitHub 绑定，union_id 为 NULL / 空串 / NULL，
// nickname/avatar 快照各不相同，用来证明迁移只动结构不动值
var _githubAccounts = []string{
	"INSERT INTO users (id, username, role, status, git_hub_id) VALUE (1, 'admin', 'admin', 0, NULL)",
	"INSERT INTO users (id, username, role, status, git_hub_id) VALUE (2, 'alice', 'user', 0, NULL)",
	"INSERT INTO users (id, username, role, status, git_hub_id) VALUE (3, 'bob', 'user', 0, NULL)",
	"INSERT INTO oauth_accounts (user_id, provider, provider_id, union_id, nickname, avatar) " +
		"VALUES (1, 'github', '1001', NULL, 'admin-gh', 'https://avatars.example/u/1001')",
	"INSERT INTO oauth_accounts (user_id, provider, provider_id, union_id, nickname, avatar) " +
		"VALUES (2, 'github', '1002', '', 'alice-gh', 'https://avatars.example/u/1002')",
	"INSERT INTO oauth_accounts (user_id, provider, provider_id, union_id, nickname, avatar) " +
		"VALUES (3, 'github', '1003', NULL, 'bob-gh', NULL)",
	"INSERT INTO about_journeys (id, journey_time, title, description, tags, sort) " +
		"VALUE (1, '2024-01-01', 'first', 'd', 'a,b', 0)",
}

func TestMigrateGitHubOnlySchema(t *testing.T) {
	db, schema := newMigrateTestDB(t)
	createLegacySchema(t, db, true)
	execAll(t, db, _githubAccounts)

	if err := migrateGitHubOnlySchema(db); err != nil {
		t.Fatalf("首次迁移: %v", err)
	}

	// 结构：旧列/旧索引消失，新列/新唯一索引到位
	for _, gone := range []struct{ table, column string }{
		{_tableUsers, _colUserGitHubID},
		{_tableOAuth, _colOAuthProvider},
		{_tableOAuth, _colOAuthProviderID},
		{_tableOAuth, _colOAuthUnionID},
		{_tableJourneys, _colJourneySort},
	} {
		exists, err := hasColumn(db, schema, gone.table, gone.column)
		if err != nil {
			t.Fatalf("检查列 %s.%s: %v", gone.table, gone.column, err)
		}
		if exists {
			t.Errorf("旧列 %s.%s 仍存在", gone.table, gone.column)
		}
	}
	for _, gone := range []struct{ table, index string }{
		{_tableUsers, _idxUserGitHubID},
		{_tableOAuth, _idxOAuthOldPID},
		{_tableOAuth, _idxOAuthOldUser},
		{_tableJourneys, _idxJourneySort},
	} {
		exists, err := hasIndex(db, schema, gone.table, gone.index)
		if err != nil {
			t.Fatalf("检查索引 %s.%s: %v", gone.table, gone.index, err)
		}
		if exists {
			t.Errorf("旧索引 %s.%s 仍存在", gone.table, gone.index)
		}
	}
	for _, want := range []struct{ table, column, index string }{
		{_tableOAuth, _colOAuthGitHubID, _idxOAuthGitHubID},
		{_tableOAuth, _colOAuthUserID, _idxOAuthUserID},
	} {
		colExists, err := hasColumn(db, schema, want.table, want.column)
		if err != nil {
			t.Fatalf("检查列 %s.%s: %v", want.table, want.column, err)
		}
		if !colExists {
			t.Errorf("新列 %s.%s 不存在", want.table, want.column)
		}
		idxExists, err := hasIndex(db, schema, want.table, want.index)
		if err != nil {
			t.Fatalf("检查索引 %s.%s: %v", want.table, want.index, err)
		}
		if !idxExists {
			t.Errorf("新索引 %s.%s 不存在", want.table, want.index)
		}
	}

	// 数据：三条 GitHub 绑定的 user_id / github_id / nickname / avatar 原样保留
	var got []struct {
		UserID   uint64
		GitHubID string
		Nickname string
		Avatar   string
	}
	if err := db.Raw(
		"SELECT user_id AS user_id, github_id AS git_hub_id, nickname AS nickname, avatar AS avatar " +
			"FROM oauth_accounts ORDER BY id",
	).Scan(&got).Error; err != nil {
		t.Fatalf("读迁移后数据: %v", err)
	}
	want := []struct {
		userID   uint64
		githubID string
		nickname string
		avatar   string
	}{
		{1, "1001", "admin-gh", "https://avatars.example/u/1001"},
		{2, "1002", "alice-gh", "https://avatars.example/u/1002"},
		{3, "1003", "bob-gh", ""},
	}
	if len(got) != len(want) {
		t.Fatalf("账号行数 = %d，期望 %d", len(got), len(want))
	}
	for i, w := range want {
		if got[i].UserID != w.userID || got[i].GitHubID != w.githubID ||
			got[i].Nickname != w.nickname || got[i].Avatar != w.avatar {
			t.Errorf("第 %d 行 = %+v，期望 %+v", i, got[i], w)
		}
	}
	var journeyCnt int64
	if err := db.Raw("SELECT COUNT(*) FROM about_journeys WHERE id = 1 AND title = 'first'").
		Scan(&journeyCnt).Error; err != nil {
		t.Fatalf("读足迹: %v", err)
	}
	if journeyCnt != 1 {
		t.Errorf("足迹行丢失：count = %d", journeyCnt)
	}

	// 幂等：第二次迁移不报错、不改数据
	if err := migrateGitHubOnlySchema(db); err != nil {
		t.Fatalf("二次迁移（幂等）: %v", err)
	}
	var againCnt int64
	if err := db.Raw("SELECT COUNT(*) FROM oauth_accounts").Scan(&againCnt).Error; err != nil {
		t.Fatalf("二次迁移后计数: %v", err)
	}
	if againCnt != int64(len(want)) {
		t.Errorf("二次迁移后账号行数 = %d，期望 %d", againCnt, len(want))
	}
}

// TestMigrateGitHubOnlySchemaRejectsUnsafeData 前置检查：任何会造成静默丢数据的形状都必须中止，
// 且中止时旧列仍在（没有做一半的 DDL）
func TestMigrateGitHubOnlySchemaRejectsUnsafeData(t *testing.T) {
	users := []string{
		"INSERT INTO users (id, username, role, status) VALUE (1, 'admin', 'admin', 0)",
		"INSERT INTO users (id, username, role, status) VALUE (2, 'alice', 'user', 0)",
	}
	journey := "INSERT INTO about_journeys (id, journey_time, title, sort) " +
		"VALUE (1, '2024-01-01', 'first', 0)"

	tests := []struct {
		name                string
		withProviderUniques bool
		rows                []string
		wantErr             string
		oldColumn           string
	}{
		{
			name:                "非 github provider",
			withProviderUniques: true,
			rows: append(append([]string{}, users...),
				"INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUE (1, 'gitlab', '1001')",
				journey),
			wantErr:   "非 github 的 provider",
			oldColumn: _colOAuthProvider,
		},
		{
			name:                "union_id 非空",
			withProviderUniques: true,
			rows: append(append([]string{}, users...),
				"INSERT INTO oauth_accounts (user_id, provider, provider_id, union_id) VALUE (1, 'github', '1001', 'u-1')",
				journey),
			wantErr:   "union_id 存在非空值",
			oldColumn: _colOAuthUnionID,
		},
		{
			name:                "users.git_hub_id 非 NULL",
			withProviderUniques: true,
			rows: append(append([]string{}, users...),
				"UPDATE users SET git_hub_id = '1001' WHERE id = 1",
				journey),
			wantErr:   "users.git_hub_id 存在非 NULL 值",
			oldColumn: _colUserGitHubID,
		},
		{
			name:                "重复 user_id",
			withProviderUniques: false,
			rows: append(append([]string{}, users...),
				"INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUE (1, 'github', '1001')",
				"INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUE (1, 'github', '1002')",
				journey),
			wantErr:   "oauth_accounts.user_id 存在 1 组重复值",
			oldColumn: _colOAuthProviderID,
		},
		{
			name:                "重复 github identity",
			withProviderUniques: false,
			rows: append(append([]string{}, users...),
				"INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUE (1, 'github', '1001')",
				"INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUE (2, 'github', '1001')",
				journey),
			wantErr:   "oauth_accounts.provider_id 存在 1 组重复值",
			oldColumn: _colOAuthProviderID,
		},
		{
			name:                "journey sort 非零",
			withProviderUniques: true,
			rows: append(append([]string{}, users...),
				"INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUE (1, 'github', '1001')",
				"INSERT INTO about_journeys (id, journey_time, title, sort) VALUE (1, '2024-01-01', 'first', 2)"),
			wantErr:   "about_journeys.sort 存在非零值",
			oldColumn: _colJourneySort,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, schema := newMigrateTestDB(t)
			createLegacySchema(t, db, tt.withProviderUniques)
			execAll(t, db, tt.rows)

			err := migrateGitHubOnlySchema(db)
			if err == nil {
				t.Fatal("期望迁移中止，实际成功")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("错误 = %q，期望包含 %q", err.Error(), tt.wantErr)
			}
			// 中止时不做任何 DDL：旧列必须还在，新列不得出现
			table := _tableOAuth
			if tt.oldColumn == _colUserGitHubID {
				table = _tableUsers
			}
			if tt.oldColumn == _colJourneySort {
				table = _tableJourneys
			}
			exists, colErr := hasColumn(db, schema, table, tt.oldColumn)
			if colErr != nil {
				t.Fatalf("检查旧列: %v", colErr)
			}
			if !exists {
				t.Errorf("迁移中止后旧列 %s.%s 已被删除", table, tt.oldColumn)
			}
			gitHubID, colErr := hasColumn(db, schema, _tableOAuth, _colOAuthGitHubID)
			if colErr != nil {
				t.Fatalf("检查 github_id: %v", colErr)
			}
			if gitHubID {
				t.Errorf("迁移中止后仍创建了 github_id")
			}
		})
	}
}

// TestMigrateGitHubOnlySchemaOnEmptyDatabase 全新部署回归：
// 空库里没有任何表，迁移必须原样放行（所有步骤按"已完成"跳过），
// 索引随之后的 AutoMigrate 建表时一并生成。曾经的实现会在空库上
// 直接 ALTER 建索引，报 1146 Table doesn't exist 导致启动失败
func TestMigrateGitHubOnlySchemaOnEmptyDatabase(t *testing.T) {
	db, schema := newMigrateTestDB(t)

	if err := migrateGitHubOnlySchema(db); err != nil {
		t.Fatalf("空库迁移应放行，实际报错: %v", err)
	}
	// 不应凭空建出任何表
	for _, table := range []string{_tableUsers, _tableOAuth, _tableJourneys} {
		if db.Migrator().HasTable(table) {
			t.Errorf("空库迁移不应创建表 %s", table)
		}
	}
	// 再跑一次仍幂等
	if err := migrateGitHubOnlySchema(db); err != nil {
		t.Fatalf("空库二次迁移: %v", err)
	}

	// AutoMigrate 建表后，新索引必须存在（迁移阶段跳过，由模型定义生成）
	if err := db.AutoMigrate(&model.User{}, &model.OAuthAccount{}, &model.AboutJourney{}); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	for _, idx := range []string{_idxOAuthGitHubID, _idxOAuthUserID} {
		exists, err := hasIndex(db, schema, _tableOAuth, idx)
		if err != nil {
			t.Fatalf("检查索引 %s: %v", idx, err)
		}
		if !exists {
			t.Errorf("AutoMigrate 后仍缺少唯一索引 %s", idx)
		}
	}
	if err := verifyGitHubOnlySchema(db); err != nil {
		t.Errorf("新库 schema 复核失败: %v", err)
	}
}
