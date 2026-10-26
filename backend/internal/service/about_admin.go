package service

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/man-mu/blog/backend/internal/model"
)

// 本文件为关于页四个列表区块的管理端写接口（#B3-#B17）：
// Skills/Projects/Journeys 增改删 + 批量排序，Contacts 仅增改删（无 sort，C 端按 id ASC）。
// 校验助手以 *AboutService 方法承载，规避与其他业务模块共享包级符号。

// ---------- 输入结构与校验助手 ----------

// SkillInput #B3/#B4 body（percent 用指针区分"未传"与合法的 0）
type SkillInput struct {
	Name    string
	Percent *int
	Items   []string
}

// ProjectInput #B7/#B8 body
type ProjectInput struct {
	Name        string
	URL         string
	Description string
	Tags        []string
}

// JourneyInput #B11/#B12 body（time 为自由文本，落库列 journey_time，D8）
type JourneyInput struct {
	Time        string
	Title       string
	Description string
	Tags        []string
}

// ContactInput #B15/#B16 body（icon 不限取值仅长度校验，D7）
type ContactInput struct {
	Label string
	Value string
	Icon  string
}

// text 写侧字符串校验：TrimSpace 后按 rune 上限校验；required 时非空（400 带字段文案）
func (s *AboutService) text(label, val string, limit int, required bool) (string, error) {
	v := strings.TrimSpace(val)
	if v == "" {
		if required {
			return "", errBadRequest(label + "不能为空")
		}
		return "", nil
	}
	if utf8.RuneCountInString(v) > limit {
		return "", errBadRequest(fmt.Sprintf("%s不能超过 %d 个字符", label, limit))
	}
	return v, nil
}

// percent percent 必填整数 0-100（#B3；越界 400）
func (s *AboutService) percent(v *int) (int, error) {
	if v == nil {
		return 0, errBadRequest("percent 不能为空")
	}
	if *v < 0 || *v > 100 {
		return 0, errBadRequest("percent 取值范围 0-100")
	}
	return *v, nil
}

// listToCSV items/tags 数组 → 逗号串（D-about-tags）：TrimSpace 后空元素剔除，
// ≤10 元素且各 ≤30 rune（schema §2.10 写校验输入）；空数组落空串（禁 ""，即无首尾逗号）
func (s *AboutService) listToCSV(vals []string, field string) (string, error) {
	parts := make([]string, 0, len(vals))
	for _, v := range vals {
		if v = strings.TrimSpace(v); v != "" {
			parts = append(parts, v)
		}
	}
	if len(parts) > 10 {
		return "", errBadRequest(field + " 最多 10 项")
	}
	for _, v := range parts {
		if utf8.RuneCountInString(v) > 30 {
			return "", errBadRequest(field + " 单项不能超过 30 个字符")
		}
	}
	return strings.Join(parts, ","), nil
}

// csvToList 逗号串 → 数组（读侧输出），空恒 []
func (s *AboutService) csvToList(raw string) []string {
	out := make([]string, 0, strings.Count(raw, ",")+1)
	for v := range strings.SplitSeq(raw, ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

// sortOrder 合并 body 顺序与库内原顺序（#B6 范式）：body ids 非空且不重复、均须存在
// （含不存在 id → 404），缺项按库内读侧顺序追加尾部，最终按 body 顺序 + 追加项原顺序重写 1..n
func (s *AboutService) sortOrder(bodyIDs, dbIDs []uint64, notFoundMsg string) ([]uint64, error) {
	if len(bodyIDs) == 0 {
		return nil, errBadRequest("ids 不能为空")
	}
	for i, id := range bodyIDs {
		if slices.Contains(bodyIDs[:i], id) {
			return nil, errBadRequest("ids 存在重复项")
		}
		if !slices.Contains(dbIDs, id) {
			return nil, errNotFound(notFoundMsg)
		}
	}
	ordered := make([]uint64, 0, len(dbIDs))
	ordered = append(ordered, bodyIDs...)
	for _, id := range dbIDs {
		if !slices.Contains(bodyIDs, id) {
			ordered = append(ordered, id)
		}
	}
	return ordered, nil
}

// ---------- 四区块的 body 校验 → model 行 ----------

func (s *AboutService) skillModel(in SkillInput) (*model.AboutSkill, error) {
	name, err := s.text("名称", in.Name, 50, true)
	if err != nil {
		return nil, err
	}
	percent, err := s.percent(in.Percent)
	if err != nil {
		return nil, err
	}
	items, err := s.listToCSV(in.Items, "items")
	if err != nil {
		return nil, err
	}
	return &model.AboutSkill{Name: name, Percent: uint8(percent), Items: items}, nil
}

func (s *AboutService) projectModel(in ProjectInput) (*model.AboutProject, error) {
	name, err := s.text("名称", in.Name, 100, true)
	if err != nil {
		return nil, err
	}
	url, err := s.text("链接", in.URL, 255, false)
	if err != nil {
		return nil, err
	}
	description, err := s.text("描述", in.Description, 300, false)
	if err != nil {
		return nil, err
	}
	tags, err := s.listToCSV(in.Tags, "tags")
	if err != nil {
		return nil, err
	}
	return &model.AboutProject{Name: name, URL: url, Description: description, Tags: tags}, nil
}

func (s *AboutService) journeyModel(in JourneyInput) (*model.AboutJourney, error) {
	journeyTime, err := parseJourneyTime(in.Time)
	if err != nil {
		return nil, err
	}
	title, err := s.text("标题", in.Title, 50, true)
	if err != nil {
		return nil, err
	}
	description, err := s.text("描述", in.Description, 200, false)
	if err != nil {
		return nil, err
	}
	tags, err := s.listToCSV(in.Tags, "tags")
	if err != nil {
		return nil, err
	}
	return &model.AboutJourney{JourneyTime: journeyTime, Title: title, Description: description, Tags: tags}, nil
}

// parseJourneyTime 足迹日期：YYYY-M-D（不补零），解析兼容补零输入（date 控件输出 YYYY-MM-DD），
// 归一为上海时区当日零点（同 _shanghaiZone，纯日期无时刻语义）
func parseJourneyTime(v string) (time.Time, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return time.Time{}, errBadRequest("时间不能为空")
	}
	t, err := time.ParseInLocation("2006-1-2", v, _shanghaiZone)
	if err != nil {
		return time.Time{}, errBadRequest("时间格式应为 2026-4-16")
	}
	return t, nil
}

func (s *AboutService) contactModel(in ContactInput) (*model.AboutContact, error) {
	label, err := s.text("标签", in.Label, 20, true)
	if err != nil {
		return nil, err
	}
	value, err := s.text("内容", in.Value, 100, true)
	if err != nil {
		return nil, err
	}
	icon, err := s.text("图标", in.Icon, 20, false)
	if err != nil {
		return nil, err
	}
	return &model.AboutContact{Label: label, Value: value, Icon: icon}, nil
}

// ---------- DTO 构造 ----------

func (s *AboutService) skillDTO(row *model.AboutSkill) *SkillDTO {
	return &SkillDTO{
		ID:      row.ID,
		Name:    row.Name,
		Percent: min(100, int(row.Percent)), // 读侧兜底钳制 [0,100]
		Items:   s.csvToList(row.Items),
	}
}

func (s *AboutService) projectDTO(row *model.AboutProject) *ProjectDTO {
	return &ProjectDTO{
		ID:          row.ID,
		Name:        row.Name,
		URL:         row.URL,
		Description: row.Description,
		Tags:        s.csvToList(row.Tags),
	}
}

func (s *AboutService) journeyDTO(row *model.AboutJourney) *JourneyDTO {
	return &JourneyDTO{
		ID:          row.ID,
		Time:        row.JourneyTime.In(_shanghaiZone).Format("2006-1-2"), // DATE 列输出 YYYY-M-D（D8）
		Title:       row.Title,
		Description: row.Description,
		Tags:        s.csvToList(row.Tags),
	}
}

func (s *AboutService) contactDTO(row *model.AboutContact) *ContactDTO {
	return &ContactDTO{ID: row.ID, Label: row.Label, Value: row.Value, Icon: row.Icon}
}

// ---------- Skills（#B3-#B6） ----------

// CreateSkill 新增技能（#B3），返回单项 DTO
func (s *AboutService) CreateSkill(ctx context.Context, in SkillInput) (*SkillDTO, error) {
	row, err := s.skillModel(in)
	if err != nil {
		return nil, err
	}
	if err := s.svc.Repo.CreateAboutSkill(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return s.skillDTO(row), nil
}

// UpdateSkill 更新技能（#B4，全量替换；不存在 → 404）
func (s *AboutService) UpdateSkill(ctx context.Context, id uint64, in SkillInput) (*SkillDTO, error) {
	row, err := s.skillModel(in)
	if err != nil {
		return nil, err
	}
	old, err := s.svc.Repo.GetAboutSkill(ctx, id)
	if err != nil {
		return nil, errServer(err)
	}
	if old == nil {
		return nil, errNotFound("技能不存在")
	}
	row.ID = id
	if err := s.svc.Repo.UpdateAboutSkill(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return s.skillDTO(row), nil
}

// DeleteSkill 删除技能（#B5，物理删；不存在 → 幂等成功）
func (s *AboutService) DeleteSkill(ctx context.Context, id uint64) error {
	if err := s.svc.Repo.DeleteAboutSkill(ctx, id); err != nil {
		return errServer(err)
	}
	return nil
}

// SortSkills 技能批量排序（#B6，事务内逐行重写 sort=1..n）
func (s *AboutService) SortSkills(ctx context.Context, ids []uint64) error {
	return s.sortRows(ctx, ids, s.svc.Repo.ListAboutSkillIDs, s.svc.Repo.UpdateAboutSkillSort, "技能不存在")
}

// ---------- Projects（#B7-#B10） ----------

// CreateProject 新增项目（#B7）
func (s *AboutService) CreateProject(ctx context.Context, in ProjectInput) (*ProjectDTO, error) {
	row, err := s.projectModel(in)
	if err != nil {
		return nil, err
	}
	if err := s.svc.Repo.CreateAboutProject(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return s.projectDTO(row), nil
}

// UpdateProject 更新项目（#B8，全量替换；不存在 → 404）
func (s *AboutService) UpdateProject(ctx context.Context, id uint64, in ProjectInput) (*ProjectDTO, error) {
	row, err := s.projectModel(in)
	if err != nil {
		return nil, err
	}
	old, err := s.svc.Repo.GetAboutProject(ctx, id)
	if err != nil {
		return nil, errServer(err)
	}
	if old == nil {
		return nil, errNotFound("项目不存在")
	}
	row.ID = id
	if err := s.svc.Repo.UpdateAboutProject(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return s.projectDTO(row), nil
}

// DeleteProject 删除项目（#B9，物理删；不存在 → 幂等成功）
func (s *AboutService) DeleteProject(ctx context.Context, id uint64) error {
	if err := s.svc.Repo.DeleteAboutProject(ctx, id); err != nil {
		return errServer(err)
	}
	return nil
}

// SortProjects 项目批量排序（#B10）
func (s *AboutService) SortProjects(ctx context.Context, ids []uint64) error {
	return s.sortRows(ctx, ids, s.svc.Repo.ListAboutProjectIDs, s.svc.Repo.UpdateAboutProjectSort, "项目不存在")
}

// ---------- Journeys（#B11-#B13） ----------

// CreateJourney 新增足迹（#B11）
func (s *AboutService) CreateJourney(ctx context.Context, in JourneyInput) (*JourneyDTO, error) {
	row, err := s.journeyModel(in)
	if err != nil {
		return nil, err
	}
	if err := s.svc.Repo.CreateAboutJourney(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return s.journeyDTO(row), nil
}

// UpdateJourney 更新足迹（#B12，全量替换；不存在 → 404）
func (s *AboutService) UpdateJourney(ctx context.Context, id uint64, in JourneyInput) (*JourneyDTO, error) {
	row, err := s.journeyModel(in)
	if err != nil {
		return nil, err
	}
	old, err := s.svc.Repo.GetAboutJourney(ctx, id)
	if err != nil {
		return nil, errServer(err)
	}
	if old == nil {
		return nil, errNotFound("足迹不存在")
	}
	row.ID = id
	if err := s.svc.Repo.UpdateAboutJourney(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return s.journeyDTO(row), nil
}

// DeleteJourney 删除足迹（#B13，物理删；不存在 → 幂等成功）
func (s *AboutService) DeleteJourney(ctx context.Context, id uint64) error {
	if err := s.svc.Repo.DeleteAboutJourney(ctx, id); err != nil {
		return errServer(err)
	}
	return nil
}

// ---------- Contacts（#B15-#B17，无 sort） ----------

// CreateContact 新增联系方式（#B15）
func (s *AboutService) CreateContact(ctx context.Context, in ContactInput) (*ContactDTO, error) {
	row, err := s.contactModel(in)
	if err != nil {
		return nil, err
	}
	if err := s.svc.Repo.CreateAboutContact(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return s.contactDTO(row), nil
}

// UpdateContact 更新联系方式（#B16，全量替换；不存在 → 404）
func (s *AboutService) UpdateContact(ctx context.Context, id uint64, in ContactInput) (*ContactDTO, error) {
	row, err := s.contactModel(in)
	if err != nil {
		return nil, err
	}
	old, err := s.svc.Repo.GetAboutContact(ctx, id)
	if err != nil {
		return nil, errServer(err)
	}
	if old == nil {
		return nil, errNotFound("联系方式不存在")
	}
	row.ID = id
	if err := s.svc.Repo.UpdateAboutContact(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return s.contactDTO(row), nil
}

// DeleteContact 删除联系方式（#B17，物理删；不存在 → 幂等成功）
func (s *AboutService) DeleteContact(ctx context.Context, id uint64) error {
	if err := s.svc.Repo.DeleteAboutContact(ctx, id); err != nil {
		return errServer(err)
	}
	return nil
}

// ---------- 排序公共流程 ----------

// sortRows 三区块共用的排序流程：取库内全集 → 校验/合并 body 顺序 → 事务重写 sort。
// listIDs / applySort 为对应区块的仓库方法（方法值，避免为三张表复制同构代码）
func (s *AboutService) sortRows(
	ctx context.Context,
	ids []uint64,
	listIDs func(context.Context) ([]uint64, error),
	applySort func(context.Context, []uint64) error,
	notFoundMsg string,
) error {
	dbIDs, err := listIDs(ctx)
	if err != nil {
		return errServer(err)
	}
	ordered, err := s.sortOrder(ids, dbIDs, notFoundMsg)
	if err != nil {
		return err
	}
	if err := applySort(ctx, ordered); err != nil {
		return errServer(err)
	}
	return nil
}
