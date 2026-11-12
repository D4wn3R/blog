// GitHub-only schema 收敛：把物理表从"多平台 OAuth + 历史漂移列"状态迁到当前模型定义的形状。
//
// 为什么不能只靠 AutoMigrate：AutoMigrate 只加列/加索引，不删列，也不会把旧唯一索引换成新名字。
// 本项目的漂移列（users.git_hub_id、oauth_accounts.provider/union_id、about_journeys.sort）
// 都是模型早已不读写的历史残留，删除必须显式做。
package main

import (
	"fmt"

	"gorm.io/gorm"
)

// 迁移涉及的表/列/索引名集中声明（拼错名字的代价是静默跳过），
// 前缀 _ 与项目其余未导出顶层声明保持一致
const (
	_tableUsers    = "users"
	_tableOAuth    = "oauth_accounts"
	_tableJourneys = "about_journeys"

	_colUserGitHubID    = "git_hub_id"
	_idxUserGitHubID    = "idx_users_git_hub_id"
	_colOAuthUserID     = "user_id"
	_colOAuthProvider   = "provider"
	_colOAuthProviderID = "provider_id"
	_colOAuthGitHubID   = "github_id"
	_colOAuthUnionID    = "union_id"
	_idxOAuthOldPID     = "uk_provider_pid"
	_idxOAuthOldUser    = "uk_user_provider"
	_idxOAuthGitHubID   = "uk_oauth_accounts_github_id"
	_idxOAuthUserID     = "uk_oauth_accounts_user_id"
	_colJourneySort     = "sort"
	_idxJourneySort     = "idx_about_journeys_sort"
)

// migrateGitHubOnlySchema 执行 GitHub-only schema 收敛，幂等且可重复运行：
//  1. 只读前置检查（数据不满足即中止，此刻未执行任何 DDL，旧 schema 完整保留）；
//  2. 删 users.git_hub_id（含索引）→ provider_id 重命名 github_id → 建两条新唯一索引
//     → 删旧 (provider,x) 唯一索引 → 删 provider/union_id → 删 about_journeys.sort（含索引）。
//
// 已由外部人工改过的库按"列/索引是否存在"跳过已完成步骤；provider_id 与 github_id 同时存在
// 视为无法判定的事实冲突，直接失败而不是猜
func migrateGitHubOnlySchema(db *gorm.DB) error {
	schema, err := currentSchema(db)
	if err != nil {
		return err
	}
	if err := checkGitHubOnlyPreconditions(db, schema); err != nil {
		return err
	}

	// users.git_hub_id：GORM 默认蛇形转换曾把 GitHubID 拆成 git_hub_id，实际 GitHub 账号 id 在 oauth_accounts
	if err := dropIndexIfExists(db, schema, _tableUsers, _idxUserGitHubID); err != nil {
		return err
	}
	if err := dropColumnIfExists(db, schema, _tableUsers, _colUserGitHubID); err != nil {
		return err
	}

	// oauth_accounts：先把 provider_id 就地改名 github_id（列名在旧索引里同步更新），
	// 再建两条新唯一索引，最后才删旧索引——
	// uk_user_provider(user_id, provider) 是外键 fk_users_o_auth_accounts 依赖的索引，
	// 必须先有 uk_oauth_accounts_user_id 顶上，否则 MySQL 拒绝删除（errno 1553）
	if err := renameProviderIDToGitHubID(db, schema); err != nil {
		return err
	}
	if err := ensureUniqueIndex(db, schema, _tableOAuth, _idxOAuthGitHubID, _colOAuthGitHubID); err != nil {
		return err
	}
	if err := ensureUniqueIndex(db, schema, _tableOAuth, _idxOAuthUserID, _colOAuthUserID); err != nil {
		return err
	}
	if err := dropIndexIfExists(db, schema, _tableOAuth, _idxOAuthOldPID); err != nil {
		return err
	}
	if err := dropIndexIfExists(db, schema, _tableOAuth, _idxOAuthOldUser); err != nil {
		return err
	}
	if err := dropColumnIfExists(db, schema, _tableOAuth, _colOAuthProvider); err != nil {
		return err
	}
	if err := dropColumnIfExists(db, schema, _tableOAuth, _colOAuthUnionID); err != nil {
		return err
	}

	// about_journeys.sort：#B14 手动排序已废，读侧固定 journey_time DESC，写侧无接口
	if err := dropIndexIfExists(db, schema, _tableJourneys, _idxJourneySort); err != nil {
		return err
	}
	return dropColumnIfExists(db, schema, _tableJourneys, _colJourneySort)
}

// verifyGitHubOnlySchema 迁移后核对模型与物理 schema 一致：
// 旧列必须消失、新列与新唯一索引必须存在。AutoMigrate 之后跑，能兜住
// "模型字段缺 column tag 又生成 git_hub_id" 这类回归
func verifyGitHubOnlySchema(db *gorm.DB) error {
	schema, err := currentSchema(db)
	if err != nil {
		return err
	}
	gone := []struct{ table, column string }{
		{_tableUsers, _colUserGitHubID},
		{_tableOAuth, _colOAuthProvider},
		{_tableOAuth, _colOAuthProviderID},
		{_tableOAuth, _colOAuthUnionID},
		{_tableJourneys, _colJourneySort},
	}
	for _, g := range gone {
		exists, err := hasColumn(db, schema, g.table, g.column)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("迁移后仍存在旧列 %s.%s", g.table, g.column)
		}
	}
	for _, idx := range []string{_idxOAuthGitHubID, _idxOAuthUserID} {
		exists, err := hasIndex(db, schema, _tableOAuth, idx)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("迁移后缺少唯一索引 %s.%s", _tableOAuth, idx)
		}
	}
	return nil
}

// checkGitHubOnlyPreconditions 只读前置检查：任何一项不满足都返回带行数的错误，
// 调用方据此中止迁移（不做任何 DDL、不静默丢值）
func checkGitHubOnlyPreconditions(db *gorm.DB, schema string) error {
	// 平台维度已从数据库退出：残留的 provider 必须是唯一合法值 github
	if err := assertNoRows(db, schema, _tableOAuth, _colOAuthProvider,
		"provider IS NULL OR provider <> 'github'",
		"oauth_accounts 存在非 github 的 provider，需人工合并到 GitHub 账号后再迁移"); err != nil {
		return err
	}
	// union_id 只有空串/NULL，属无业务值
	if err := assertNoRows(db, schema, _tableOAuth, _colOAuthUnionID,
		"union_id IS NOT NULL AND union_id <> ''",
		"oauth_accounts.union_id 存在非空值，需人工确认后再删列"); err != nil {
		return err
	}
	// users.git_hub_id 历史残留：非 NULL 意味着有人往里写过，必须先人工确认
	if err := assertNoRows(db, schema, _tableUsers, _colUserGitHubID,
		"git_hub_id IS NOT NULL",
		"users.git_hub_id 存在非 NULL 值，需人工合并到 oauth_accounts.github_id 后再删列"); err != nil {
		return err
	}
	// 已废弃的手动排序：非零值代表真实的排序意图，不能静默丢
	if err := assertNoRows(db, schema, _tableJourneys, _colJourneySort,
		"`sort` <> 0",
		"about_journeys.sort 存在非零值，需人工确认后再删列"); err != nil {
		return err
	}

	providerIDExists, err := hasColumn(db, schema, _tableOAuth, _colOAuthProviderID)
	if err != nil {
		return err
	}
	gitHubIDExists, err := hasColumn(db, schema, _tableOAuth, _colOAuthGitHubID)
	if err != nil {
		return err
	}
	if providerIDExists && gitHubIDExists {
		return fmt.Errorf("迁移中止：oauth_accounts 同时存在 provider_id 与 github_id，需人工确认保留哪一列")
	}
	// 两列都不存在：表为空或外部改成别的形状，按"已完成"放行，由 AutoMigrate 补列
	identity := ""
	switch {
	case gitHubIDExists:
		identity = _colOAuthGitHubID
	case providerIDExists:
		identity = _colOAuthProviderID
	}
	if identity == "" {
		return nil
	}
	// 唯一索引重建要求数据先行唯一：先查重，重复即中止（不自动合并/删除账号）
	if err := assertNoRows(db, schema, _tableOAuth, identity,
		identity+" IS NULL",
		"oauth_accounts."+identity+" 存在 NULL 值，无法建立唯一索引"); err != nil {
		return err
	}
	for _, col := range []string{_colOAuthUserID, identity} {
		if err := assertNoDuplicates(db, schema, _tableOAuth, col); err != nil {
			return err
		}
	}
	return nil
}

// assertNoRows 当 table 上 where 命中行时返回带行数的中止错误；列/表不存在视为无需检查
func assertNoRows(db *gorm.DB, schema, table, column, where, hint string) error {
	exists, err := hasColumn(db, schema, table, column)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	var n int64
	if err := db.Table(table).Where(where).Count(&n).Error; err != nil {
		return fmt.Errorf("检查 %s.%s 数据失败: %w", table, column, err)
	}
	if n > 0 {
		return fmt.Errorf("迁移中止：%s（%d 行）", hint, n)
	}
	return nil
}

// assertNoDuplicates 唯一索引重建前的查重：column 上出现重复即中止
func assertNoDuplicates(db *gorm.DB, schema, table, column string) error {
	exists, err := hasColumn(db, schema, table, column)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	var n int64
	query := fmt.Sprintf(
		"SELECT COUNT(*) FROM (SELECT `%s` FROM `%s` GROUP BY `%s` HAVING COUNT(*) > 1) dup",
		column, table, column,
	)
	if err := db.Raw(query).Scan(&n).Error; err != nil {
		return fmt.Errorf("检查 %s.%s 重复值失败: %w", table, column, err)
	}
	if n > 0 {
		return fmt.Errorf("迁移中止：%s.%s 存在 %d 组重复值，需人工合并后再建立唯一索引", table, column, n)
	}
	return nil
}

// renameProviderIDToGitHubID 把 provider_id 就地改名为 github_id：
// 用 information_schema 里的 COLUMN_TYPE 保留原类型/宽度，不猜
func renameProviderIDToGitHubID(db *gorm.DB, schema string) error {
	providerIDExists, err := hasColumn(db, schema, _tableOAuth, _colOAuthProviderID)
	if err != nil {
		return err
	}
	if !providerIDExists {
		return nil
	}
	gitHubIDExists, err := hasColumn(db, schema, _tableOAuth, _colOAuthGitHubID)
	if err != nil {
		return err
	}
	if gitHubIDExists {
		return fmt.Errorf("迁移中止：oauth_accounts 同时存在 provider_id 与 github_id")
	}
	var columnType string
	err = db.Raw(
		"SELECT COLUMN_TYPE FROM information_schema.COLUMNS "+
			"WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
		schema, _tableOAuth, _colOAuthProviderID,
	).Scan(&columnType).Error
	if err != nil {
		return fmt.Errorf("读取 oauth_accounts.provider_id 列定义失败: %w", err)
	}
	if columnType == "" {
		return fmt.Errorf("oauth_accounts.provider_id 列定义为空")
	}
	// 前置检查已保证无 NULL：直接收紧为 NOT NULL，与模型定义一致
	stmt := fmt.Sprintf(
		"ALTER TABLE `%s` CHANGE COLUMN `%s` `%s` %s NOT NULL",
		_tableOAuth, _colOAuthProviderID, _colOAuthGitHubID, columnType,
	)
	if err := db.Exec(stmt).Error; err != nil {
		return fmt.Errorf("重命名 oauth_accounts.provider_id 为 github_id 失败: %w", err)
	}
	return nil
}

// dropColumnIfExists 列存在才删（幂等）；表不存在时无需处理
func dropColumnIfExists(db *gorm.DB, schema, table, column string) error {
	exists, err := hasColumn(db, schema, table, column)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	if err := db.Exec(fmt.Sprintf("ALTER TABLE `%s` DROP COLUMN `%s`", table, column)).Error; err != nil {
		return fmt.Errorf("删除 %s.%s 失败: %w", table, column, err)
	}
	return nil
}

// dropIndexIfExists 索引存在才删（幂等）
func dropIndexIfExists(db *gorm.DB, schema, table, index string) error {
	exists, err := hasIndex(db, schema, table, index)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	if err := db.Exec(fmt.Sprintf("ALTER TABLE `%s` DROP INDEX `%s`", table, index)).Error; err != nil {
		return fmt.Errorf("删除索引 %s.%s 失败: %w", table, index, err)
	}
	return nil
}

// ensureUniqueIndex 唯一索引不存在才建（幂等）。
// 表不存在（全新部署）时直接跳过：索引随 AutoMigrate 建表时一并生成，
// 这里硬 ALTER 会报 1146（Table doesn't exist）
func ensureUniqueIndex(db *gorm.DB, schema, table, index, column string) error {
	if !db.Migrator().HasTable(table) {
		return nil
	}
	exists, err := hasIndex(db, schema, table, index)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	stmt := fmt.Sprintf(
		"ALTER TABLE `%s` ADD UNIQUE INDEX `%s` (`%s`)",
		table, index, column,
	)
	if err := db.Exec(stmt).Error; err != nil {
		return fmt.Errorf("创建唯一索引 %s.%s 失败: %w", table, index, err)
	}
	return nil
}

// currentSchema 当前连接的 schema 名（information_schema 查询的前置条件）
func currentSchema(db *gorm.DB) (string, error) {
	var name string
	if err := db.Raw("SELECT DATABASE()").Scan(&name).Error; err != nil {
		return "", fmt.Errorf("读取当前 schema 失败: %w", err)
	}
	if name == "" {
		return "", fmt.Errorf("当前连接未选择数据库 schema")
	}
	return name, nil
}

// hasColumn 列是否存在；表不存在时返回 false（全新部署直接跳过）
func hasColumn(db *gorm.DB, schema, table, column string) (bool, error) {
	if !db.Migrator().HasTable(table) {
		return false, nil
	}
	var n int64
	err := db.Raw(
		"SELECT COUNT(*) FROM information_schema.COLUMNS "+
			"WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
		schema, table, column,
	).Scan(&n).Error
	if err != nil {
		return false, fmt.Errorf("检查列 %s.%s 失败: %w", table, column, err)
	}
	return n > 0, nil
}

// hasIndex 索引是否存在；表不存在时返回 false
func hasIndex(db *gorm.DB, schema, table, index string) (bool, error) {
	if !db.Migrator().HasTable(table) {
		return false, nil
	}
	var n int64
	err := db.Raw(
		"SELECT COUNT(*) FROM information_schema.STATISTICS "+
			"WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?",
		schema, table, index,
	).Scan(&n).Error
	if err != nil {
		return false, fmt.Errorf("检查索引 %s.%s 失败: %w", table, index, err)
	}
	return n > 0, nil
}
