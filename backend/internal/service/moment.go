package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/datatypes"

	"github.com/man-mu/blog/backend/internal/model"
)

// MomentService 个人动态子服务：C 端分页列表 + 管理端 CRUD（#M1~#M4）
type MomentService struct {
	svc *Service
}

// _momentImagesLimit 配图上限 9 张（D-moment-images-limit，对齐九宫格）
const _momentImagesLimit = 9

// MomentDTO 动态白名单（响应）：images 恒 []（禁 null）；无 updated_at（D-no-updated-at）
type MomentDTO struct {
	ID        uint64    `json:"id"`
	Content   string    `json:"content"`
	Images    []string  `json:"images"`
	CreatedAt time.Time `json:"created_at"`
}

// List 动态分页列表（#M1，公开）：仅 status=1，created_at DESC, id DESC（走 idx_moments_status_created）
func (s *MomentService) List(ctx context.Context, page, pageSize int) (*PageDTO, error) {
	page, pageSize = NormalizePage(page, pageSize)
	total, err := s.svc.Repo.CountMoments(ctx)
	if err != nil {
		return nil, errServer(err)
	}
	moments, err := s.svc.Repo.ListMoments(ctx, (page-1)*pageSize, pageSize)
	if err != nil {
		return nil, errServer(err)
	}
	list := make([]MomentDTO, 0, len(moments))
	for i := range moments {
		list = append(list, toMomentDTO(&moments[i]))
	}
	return &PageDTO{List: list, Total: total, Page: page, PageSize: pageSize}, nil
}

// Create 发表动态（#M2）：无草稿态，落库即 status=1 显示；
// images 缺省/空 → 恒显式 marshal "[]"（schema §7.3：datatypes.JSON 零值 INSERT 落 NULL，禁 NULL）
func (s *MomentService) Create(ctx context.Context, content string, images []string) (*MomentDTO, error) {
	content, imagesJSON, cleaned, err := normalizeMoment(content, images)
	if err != nil {
		return nil, err
	}
	moment := &model.Moment{Content: content, Images: imagesJSON, Status: model.MomentStatusVisible}
	if err := s.svc.Repo.CreateMoment(ctx, moment); err != nil {
		return nil, errServer(err)
	}
	return &MomentDTO{ID: moment.ID, Content: content, Images: cleaned, CreatedAt: moment.CreatedAt}, nil
}

// Update 编辑动态（#M3，PUT 全量替换同文章模块）：content 必传，images 空数组 = 清空配图（同落 "[]"）
func (s *MomentService) Update(ctx context.Context, id uint64, content string, images []string) (*MomentDTO, error) {
	content, imagesJSON, cleaned, err := normalizeMoment(content, images)
	if err != nil {
		return nil, err
	}
	moment, err := s.svc.Repo.GetMomentByID(ctx, id)
	if err != nil {
		return nil, errServer(err)
	}
	if moment == nil {
		return nil, errNotFound("动态不存在")
	}
	if err := s.svc.Repo.UpdateMoment(ctx, id, content, imagesJSON); err != nil {
		return nil, errServer(err)
	}
	return &MomentDTO{ID: moment.ID, Content: content, Images: cleaned, CreatedAt: moment.CreatedAt}, nil
}

// Delete 删除动态（#M4，D-moment-del）：物理删除，不存在零行删除 → 幂等成功
// （与 #A8 文章删除的 404 刻意不同，契约原样）
func (s *MomentService) Delete(ctx context.Context, id uint64) error {
	if err := s.svc.Repo.DeleteMoment(ctx, id); err != nil {
		return errServer(err)
	}
	return nil
}

// normalizeMoment 写侧从严（schema §7.7）：content TrimSpace 后 1-1000 rune；
// images ≤9 张、每项 TrimSpace 非空、以 / 开头、rune ≤255、静默去重；
// 返回序列化 JSON（cleaned 恒非 nil，空数组 marshal 出 "[]"，绝不让零值直插落 NULL）
func normalizeMoment(content string, images []string) (string, datatypes.JSON, []string, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return "", nil, nil, errBadRequest("动态内容不能为空")
	}
	if utf8.RuneCountInString(content) > 1000 {
		return "", nil, nil, errBadRequest("动态内容最多 1000 字")
	}
	cleaned := make([]string, 0, len(images))
	seen := make(map[string]struct{}, len(images))
	for _, img := range images {
		img = strings.TrimSpace(img)
		if img == "" {
			return "", nil, nil, errBadRequest("图片地址不能为空")
		}
		if !strings.HasPrefix(img, "/") {
			return "", nil, nil, errBadRequest("图片地址必须以 / 开头")
		}
		if utf8.RuneCountInString(img) > 255 {
			return "", nil, nil, errBadRequest("图片地址过长")
		}
		if _, dup := seen[img]; dup {
			continue // 静默去重
		}
		seen[img] = struct{}{}
		cleaned = append(cleaned, img)
	}
	if len(cleaned) > _momentImagesLimit {
		return "", nil, nil, errBadRequest("配图最多 9 张")
	}
	raw, err := json.Marshal(cleaned) // []string marshal 无失败路径，err 仅形式兜底
	if err != nil {
		return "", nil, nil, errServer(err)
	}
	return content, datatypes.JSON(raw), cleaned, nil
}

// toMomentDTO 行转 DTO：images 为 nil/空/解析异常 → 恒输出 []（禁 null）
func toMomentDTO(m *model.Moment) MomentDTO {
	images := make([]string, 0, _momentImagesLimit)
	if len(m.Images) > 0 {
		_ = json.Unmarshal(m.Images, &images) // 落库前恒为合法数组，异常数据视为无图
	}
	if images == nil {
		images = make([]string, 0) // 兜底 JSON null（Unmarshal 会置 nil）
	}
	return MomentDTO{ID: m.ID, Content: m.Content, Images: images, CreatedAt: m.CreatedAt}
}
