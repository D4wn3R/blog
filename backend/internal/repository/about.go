// Package repository 数据访问层：GORM 查询与事务，只认 model，业务错误以哨兵 error 返回
package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/man-mu/blog/backend/internal/model"
)

// ---------- 通用模式（四张 about 列表表共用，泛型按具体 model 实例化） ----------

// _aboutOrder 有 sort 列表的读侧排序；contacts/journeys 无 sort 语义，各有专属顺序
const (
	_aboutOrder        = "sort ASC, id ASC"
	_aboutOrderContact = "id ASC"
	_aboutOrderJourney = "journey_time DESC, id DESC" // 时间降序（晚在上），同日新记录在前
)

// aboutList 全量列表（泛型内部助手，经由具体方法暴露）
func aboutList[T any](ctx context.Context, db *gorm.DB, order string) ([]T, error) {
	var rows []T
	err := db.WithContext(ctx).Order(order).Find(&rows).Error
	return rows, err
}

// aboutGet 按主键查单行；不存在返回 (nil, nil)
func aboutGet[T any](ctx context.Context, db *gorm.DB, id uint64) (*T, error) {
	var row T
	err := db.WithContext(ctx).First(&row, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// aboutCreate 插入单行（ID/CreatedAt 由 GORM 回填）
func aboutCreate[T any](ctx context.Context, db *gorm.DB, row *T) error {
	return db.WithContext(ctx).Create(row).Error
}

// aboutUpdate 按 Select 列全量更新（零值列也落库，如清空 tags）
func aboutUpdate[T any](ctx context.Context, db *gorm.DB, row *T, cols []string) error {
	return db.WithContext(ctx).Model(row).Select(cols).Updates(row).Error
}

// aboutDelete 物理删除；不存在时零行删除，调用方按幂等成功处理
func aboutDelete[T any](ctx context.Context, db *gorm.DB, id uint64) error {
	return db.WithContext(ctx).Delete(new(T), id).Error
}

// aboutIDs 读侧顺序（#B6 排序校验的库内全集基准）
func aboutIDs[T any](ctx context.Context, db *gorm.DB, order string) ([]uint64, error) {
	var ids []uint64
	err := db.WithContext(ctx).Model(new(T)).Order(order).Pluck("id", &ids).Error
	return ids, err
}

// aboutUpdateSort 事务内按给定顺序逐行重写 sort=1..n（#B6）
func aboutUpdateSort[T any](ctx context.Context, db *gorm.DB, ids []uint64) error {
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for i, id := range ids {
			if err := tx.Model(new(T)).Where("id = ?", id).Update("sort", i+1).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ---------- Profile（#B1/#B2，单行 id 恒 1） ----------

// GetProfile 读取资料卡单行；无行返回 (nil, nil)（#B1 空态：全空串对象，永不 404）
func (r *Repository) GetProfile(ctx context.Context) (*model.Profile, error) {
	var p model.Profile
	err := r.db.WithContext(ctx).First(&p, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// UpsertProfile 资料卡 upsert（#B2：无行插入 id=1，有行更新三字段；单条语句天然幂等）
func (r *Repository) UpsertProfile(ctx context.Context, p *model.Profile) error {
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"nickname", "title_en", "bio"}),
	}).Create(p).Error
}

// ---------- SiteSettings（#B1/#B18，8 白名单键 KV） ----------

// ListSiteSettings 全键一查（#B1 聚合的第 2 条 SQL）
func (r *Repository) ListSiteSettings(ctx context.Context) ([]model.SiteSetting, error) {
	var rows []model.SiteSetting
	err := r.db.WithContext(ctx).Find(&rows).Error
	return rows, err
}

// UpsertSiteSettings 批量逐键 upsert（#B18：无行插入、有行覆盖 value，单条语句）
func (r *Repository) UpsertSiteSettings(ctx context.Context, rows []model.SiteSetting) error {
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value"}),
	}).Create(&rows).Error
}

// ---------- Skills（#B3-#B6） ----------

// ListAboutSkills 全量技能列表，sort ASC, id ASC（#B1 读侧）
func (r *Repository) ListAboutSkills(ctx context.Context) ([]model.AboutSkill, error) {
	return aboutList[model.AboutSkill](ctx, r.db, _aboutOrder)
}

// GetAboutSkill 按主键查技能；不存在返回 (nil, nil)（#B4 前置）
func (r *Repository) GetAboutSkill(ctx context.Context, id uint64) (*model.AboutSkill, error) {
	return aboutGet[model.AboutSkill](ctx, r.db, id)
}

// CreateAboutSkill 插入技能（#B3）
func (r *Repository) CreateAboutSkill(ctx context.Context, row *model.AboutSkill) error {
	return aboutCreate(ctx, r.db, row)
}

// UpdateAboutSkill 按 name/percent/items 三列全量更新（#B4）
func (r *Repository) UpdateAboutSkill(ctx context.Context, row *model.AboutSkill) error {
	return aboutUpdate(ctx, r.db, row, []string{"name", "percent", "items"})
}

// DeleteAboutSkill 物理删技能（#B5，不存在幂等成功）
func (r *Repository) DeleteAboutSkill(ctx context.Context, id uint64) error {
	return aboutDelete[model.AboutSkill](ctx, r.db, id)
}

// ListAboutSkillIDs 读侧技能全集 ID（#B6 排序校验基准）
func (r *Repository) ListAboutSkillIDs(ctx context.Context) ([]uint64, error) {
	return aboutIDs[model.AboutSkill](ctx, r.db, _aboutOrder)
}

// UpdateAboutSkillSort 事务内重写技能 sort=1..n（#B6）
func (r *Repository) UpdateAboutSkillSort(ctx context.Context, ids []uint64) error {
	return aboutUpdateSort[model.AboutSkill](ctx, r.db, ids)
}

// ---------- Projects（#B7-#B10） ----------

// ListAboutProjects 全量项目列表，sort ASC, id ASC（#B1 读侧）
func (r *Repository) ListAboutProjects(ctx context.Context) ([]model.AboutProject, error) {
	return aboutList[model.AboutProject](ctx, r.db, _aboutOrder)
}

// GetAboutProject 按主键查项目；不存在返回 (nil, nil)（#B8 前置）
func (r *Repository) GetAboutProject(ctx context.Context, id uint64) (*model.AboutProject, error) {
	return aboutGet[model.AboutProject](ctx, r.db, id)
}

// CreateAboutProject 插入项目（#B7）
func (r *Repository) CreateAboutProject(ctx context.Context, row *model.AboutProject) error {
	return aboutCreate(ctx, r.db, row)
}

// UpdateAboutProject 按业务四列全量更新（#B8，name/url/description/tags）
func (r *Repository) UpdateAboutProject(ctx context.Context, row *model.AboutProject) error {
	return aboutUpdate(ctx, r.db, row, []string{"name", "url", "description", "tags"})
}

// DeleteAboutProject 物理删项目（#B9，不存在幂等成功）
func (r *Repository) DeleteAboutProject(ctx context.Context, id uint64) error {
	return aboutDelete[model.AboutProject](ctx, r.db, id)
}

// ListAboutProjectIDs 读侧项目全集 ID（#B10 排序校验基准）
func (r *Repository) ListAboutProjectIDs(ctx context.Context) ([]uint64, error) {
	return aboutIDs[model.AboutProject](ctx, r.db, _aboutOrder)
}

// UpdateAboutProjectSort 事务内重写项目 sort=1..n（#B10）
func (r *Repository) UpdateAboutProjectSort(ctx context.Context, ids []uint64) error {
	return aboutUpdateSort[model.AboutProject](ctx, r.db, ids)
}

// ---------- Journeys（#B11-#B13，落库列 journey_time，D8） ----------

// ListAboutJourneys 全量足迹列表，journey_time DESC, id DESC（时间降序读侧，无手动排序）
func (r *Repository) ListAboutJourneys(ctx context.Context) ([]model.AboutJourney, error) {
	return aboutList[model.AboutJourney](ctx, r.db, _aboutOrderJourney)
}

// GetAboutJourney 按主键查足迹；不存在返回 (nil, nil)（#B12 前置）
func (r *Repository) GetAboutJourney(ctx context.Context, id uint64) (*model.AboutJourney, error) {
	return aboutGet[model.AboutJourney](ctx, r.db, id)
}

// CreateAboutJourney 插入足迹（#B11）
func (r *Repository) CreateAboutJourney(ctx context.Context, row *model.AboutJourney) error {
	return aboutCreate(ctx, r.db, row)
}

// UpdateAboutJourney 按 journey_time/title/description/tags 全量更新（#B12）
func (r *Repository) UpdateAboutJourney(ctx context.Context, row *model.AboutJourney) error {
	return aboutUpdate(ctx, r.db, row, []string{"journey_time", "title", "description", "tags"})
}

// DeleteAboutJourney 物理删足迹（#B13，不存在幂等成功）
func (r *Repository) DeleteAboutJourney(ctx context.Context, id uint64) error {
	return aboutDelete[model.AboutJourney](ctx, r.db, id)
}

// ---------- Contacts（#B15-#B17，无 sort 列，按 id ASC） ----------

// ListAboutContacts 全量联系方式列表，id ASC（#B1 读侧）
func (r *Repository) ListAboutContacts(ctx context.Context) ([]model.AboutContact, error) {
	return aboutList[model.AboutContact](ctx, r.db, _aboutOrderContact)
}

// GetAboutContact 按主键查联系方式；不存在返回 (nil, nil)（#B16 前置）
func (r *Repository) GetAboutContact(ctx context.Context, id uint64) (*model.AboutContact, error) {
	return aboutGet[model.AboutContact](ctx, r.db, id)
}

// CreateAboutContact 插入联系方式（#B15）
func (r *Repository) CreateAboutContact(ctx context.Context, row *model.AboutContact) error {
	return aboutCreate(ctx, r.db, row)
}

// UpdateAboutContact 按 label/value/icon 三列全量更新（#B16）
func (r *Repository) UpdateAboutContact(ctx context.Context, row *model.AboutContact) error {
	return aboutUpdate(ctx, r.db, row, []string{"label", "value", "icon"})
}

// DeleteAboutContact 物理删联系方式（#B17，不存在幂等成功）
func (r *Repository) DeleteAboutContact(ctx context.Context, id uint64) error {
	return aboutDelete[model.AboutContact](ctx, r.db, id)
}
