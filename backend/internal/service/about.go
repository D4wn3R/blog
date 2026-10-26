package service

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/man-mu/blog/backend/internal/model"
)

// AboutService 关于页内容子服务（#B1/#B2/#B18，列表项增改删排序见 about_admin.go）
type AboutService struct {
	svc *Service
}

// ProfileDTO 资料卡白名单（D-profile-3-fields：仅三字段，单行 id 恒 1 不输出）
type ProfileDTO struct {
	Nickname string `json:"nickname"`
	TitleEn  string `json:"title_en"`
	Bio      string `json:"bio"`
}

// SettingsDTO 站点文案 8 白名单键（D-site-settings，出入参均为平铺对象；缺键输出空串）
type SettingsDTO struct {
	HeroPrefix  string `json:"hero_prefix"`
	HeroAccent  string `json:"hero_accent"`
	HeroTagline string `json:"hero_tagline"`
	SiteTitle   string `json:"site_title"` // 浏览器标签页标题覆盖项（前端未配置时回退 site_name）
	SiteName    string `json:"site_name"`
	SiteURL     string `json:"site_url"`
	SiteDesc    string `json:"site_desc"`
	SiteImage   string `json:"site_image"`
}

// SkillDTO 技能列表项白名单（items 逗号串拆数组输出，D-about-tags）
type SkillDTO struct {
	ID      uint64   `json:"id"`
	Name    string   `json:"name"`
	Percent int      `json:"percent"`
	Items   []string `json:"items"`
}

// ProjectDTO 项目列表项白名单
type ProjectDTO struct {
	ID          uint64   `json:"id"`
	Name        string   `json:"name"`
	URL         string   `json:"url"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
}

// JourneyDTO 足迹列表项白名单（落库 journey_time 输出 time，D8）
type JourneyDTO struct {
	ID          uint64   `json:"id"`
	Time        string   `json:"time"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
}

// ContactDTO 联系方式列表项白名单
type ContactDTO struct {
	ID    uint64 `json:"id"`
	Label string `json:"label"`
	Value string `json:"value"`
	Icon  string `json:"icon"`
}

// AboutDTO #B1 聚合响应（≤6 条 SQL：profile 1 + settings 1 + 四表各 1）
type AboutDTO struct {
	Profile  ProfileDTO   `json:"profile"`
	Settings SettingsDTO  `json:"settings"`
	Skills   []SkillDTO   `json:"skills"`
	Projects []ProjectDTO `json:"projects"`
	Journey  []JourneyDTO `json:"journey"`
	Contacts []ContactDTO `json:"contacts"`
}

// Get 关于页聚合读取（#B1，公开）：空态永不 404——profile 无行回全空串、settings 缺键空串、列表空 []；
// percent 越界值钳制 [0,100]（写入口已拦，读侧兜底）
func (s *AboutService) Get(ctx context.Context) (*AboutDTO, error) {
	profile, err := s.svc.Repo.GetProfile(ctx) // 1/6
	if err != nil {
		return nil, errServer(err)
	}
	settingRows, err := s.svc.Repo.ListSiteSettings(ctx) // 2/6
	if err != nil {
		return nil, errServer(err)
	}
	skillRows, err := s.svc.Repo.ListAboutSkills(ctx) // 3/6
	if err != nil {
		return nil, errServer(err)
	}
	projectRows, err := s.svc.Repo.ListAboutProjects(ctx) // 4/6
	if err != nil {
		return nil, errServer(err)
	}
	journeyRows, err := s.svc.Repo.ListAboutJourneys(ctx) // 5/6
	if err != nil {
		return nil, errServer(err)
	}
	contactRows, err := s.svc.Repo.ListAboutContacts(ctx) // 6/6
	if err != nil {
		return nil, errServer(err)
	}

	agg := &AboutDTO{
		Profile:  profileDTO(profile),
		Settings: settingsDTO(settingRows),
		Skills:   make([]SkillDTO, 0, len(skillRows)),
		Projects: make([]ProjectDTO, 0, len(projectRows)),
		Journey:  make([]JourneyDTO, 0, len(journeyRows)),
		Contacts: make([]ContactDTO, 0, len(contactRows)),
	}
	for i := range skillRows {
		agg.Skills = append(agg.Skills, *s.skillDTO(&skillRows[i]))
	}
	for i := range projectRows {
		agg.Projects = append(agg.Projects, *s.projectDTO(&projectRows[i]))
	}
	for i := range journeyRows {
		agg.Journey = append(agg.Journey, *s.journeyDTO(&journeyRows[i]))
	}
	for i := range contactRows {
		agg.Contacts = append(agg.Contacts, *s.contactDTO(&contactRows[i]))
	}
	return agg, nil
}

// profileDTO 无行回全空串对象（B 端首次进入可编辑）
func profileDTO(p *model.Profile) ProfileDTO {
	if p == nil {
		return ProfileDTO{}
	}
	return ProfileDTO{Nickname: p.Nickname, TitleEn: p.TitleEn, Bio: p.Bio}
}

// settingsDTO 全量 8 键，缺行/缺键补空串
func settingsDTO(rows []model.SiteSetting) SettingsDTO {
	values := make(map[string]string, len(rows))
	for i := range rows {
		values[rows[i].Key] = rows[i].Value
	}
	return SettingsDTO{
		HeroPrefix:  values["hero_prefix"],
		HeroAccent:  values["hero_accent"],
		HeroTagline: values["hero_tagline"],
		SiteTitle:   values["site_title"],
		SiteName:    values["site_name"],
		SiteURL:     values["site_url"],
		SiteDesc:    values["site_desc"],
		SiteImage:   values["site_image"],
	}
}

// UpdateProfile 更新资料卡（#B2，全量 upsert 单行 id=1），响应更新后的 ProfileDTO
func (s *AboutService) UpdateProfile(ctx context.Context, nickname, titleEn, bio string) (*ProfileDTO, error) {
	nickname, err := s.text("昵称", nickname, 50, true)
	if err != nil {
		return nil, err
	}
	titleEn, err = s.text("英文头衔", titleEn, 100, false)
	if err != nil {
		return nil, err
	}
	bio, err = s.text("简介", bio, 200, false)
	if err != nil {
		return nil, err
	}
	row := &model.Profile{ID: 1, Nickname: nickname, TitleEn: titleEn, Bio: bio}
	if err := s.svc.Repo.UpsertProfile(ctx, row); err != nil {
		return nil, errServer(err)
	}
	return &ProfileDTO{Nickname: nickname, TitleEn: titleEn, Bio: bio}, nil
}

// _siteSettingLimits #B18 白名单键 → rune 上限（schema §2.9）
var _siteSettingLimits = map[string]int{
	"hero_prefix":  30,
	"hero_accent":  30,
	"hero_tagline": 100,
	"site_title":   50,
	"site_name":    50,
	"site_url":     255,
	"site_desc":    200,
	"site_image":   255,
}

// UpdateSiteSettings 站点文案部分更新（#B18）：只 upsert 传入键，未传键不动；
// 空对象/白名单外键/超限 → 400；响应更新后的全量 8 键 SettingsDTO
func (s *AboutService) UpdateSiteSettings(ctx context.Context, in map[string]string) (*SettingsDTO, error) {
	if len(in) == 0 {
		return nil, errBadRequest("无有效字段")
	}
	rows := make([]model.SiteSetting, 0, len(in))
	for key, value := range in {
		limit, ok := _siteSettingLimits[key]
		if !ok {
			return nil, errBadRequest("不支持的设置项")
		}
		value = strings.TrimSpace(value)
		if utf8.RuneCountInString(value) > limit {
			return nil, errBadRequest(fmt.Sprintf("%s 不能超过 %d 个字符", key, limit))
		}
		rows = append(rows, model.SiteSetting{Key: key, Value: value})
	}
	if err := s.svc.Repo.UpsertSiteSettings(ctx, rows); err != nil {
		return nil, errServer(err)
	}
	settingRows, err := s.svc.Repo.ListSiteSettings(ctx)
	if err != nil {
		return nil, errServer(err)
	}
	dto := settingsDTO(settingRows)
	return &dto, nil
}
