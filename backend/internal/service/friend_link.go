package service

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/man-mu/blog/backend/internal/model"
	"github.com/man-mu/blog/backend/internal/repository"
)

// FriendLinkService 友链子服务（#F1-#F4）
type FriendLinkService struct {
	svc *Service
}

// FriendLinkDTO 友链白名单（#F1/#F2/#F3 响应，created_at 不输出）
type FriendLinkDTO struct {
	ID          uint64 `json:"id"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description"`
	Image       string `json:"image"`
}

func toFriendLinkDTO(l *model.FriendLink) *FriendLinkDTO {
	return &FriendLinkDTO{
		ID:          l.ID,
		Name:        l.Name,
		URL:         l.URL,
		Description: l.Description,
		Image:       l.Image,
	}
}

// fields 写入四列的统一校验（#F2/#F3 全量替换同构）：写从严，TrimSpace + rune 上限
func (s *FriendLinkService) fields(name, url, description, image string) (*model.FriendLink, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errBadRequest("站点名称不能为空")
	}
	if utf8.RuneCountInString(name) > 50 {
		return nil, errBadRequest("站点名称不能超过 50 个字符")
	}
	url = strings.TrimSpace(url)
	if url == "" {
		return nil, errBadRequest("链接地址不能为空")
	}
	if utf8.RuneCountInString(url) > 255 {
		return nil, errBadRequest("链接地址不能超过 255 个字符")
	}
	// D-friend-url：仅校验协议前缀，不做服务端探活
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		return nil, errBadRequest("链接地址须以 http(s):// 开头")
	}
	description = strings.TrimSpace(description)
	if utf8.RuneCountInString(description) > 200 {
		return nil, errBadRequest("简介不能超过 200 个字符")
	}
	// 头像为友邻站点外链（与本站对象存储无关）：可空；非空须以 http(s):// 开头，
	// 仅校验协议前缀不做探活（同 D-friend-url 口径）
	image = strings.TrimSpace(image)
	if image != "" {
		if !strings.HasPrefix(image, "http://") && !strings.HasPrefix(image, "https://") {
			return nil, errBadRequest("头像须以 http(s):// 开头")
		}
		if utf8.RuneCountInString(image) > 255 {
			return nil, errBadRequest("头像不能超过 255 个字符")
		}
	}
	return &model.FriendLink{Name: name, URL: url, Description: description, Image: image}, nil
}

// List 友链全量列表（#F1，公开，id ASC，空表返回 []）
func (s *FriendLinkService) List(ctx context.Context) ([]FriendLinkDTO, error) {
	links, err := s.svc.Repo.ListFriendLinks(ctx)
	if err != nil {
		return nil, errServer(err)
	}
	list := make([]FriendLinkDTO, 0, len(links))
	for i := range links {
		list = append(list, *toFriendLinkDTO(&links[i]))
	}
	return list, nil
}

// Create 新增友链（#F2）：url 双层查重——SELECT 友好前置 + uk_friend_links_url 唯一索引兜底并发
func (s *FriendLinkService) Create(ctx context.Context, name, url, description, image string) (*FriendLinkDTO, error) {
	link, err := s.fields(name, url, description, image)
	if err != nil {
		return nil, err
	}
	if err := s.checkURLAvailable(ctx, url, 0); err != nil {
		return nil, err
	}
	if err := s.svc.Repo.CreateFriendLink(ctx, link); err != nil {
		if errors.Is(err, repository.ErrDupFriendURL) {
			return nil, errDupFriendURL()
		}
		return nil, errServer(err)
	}
	return toFriendLinkDTO(link), nil
}

// Update 编辑友链（#F3，全量替换；url 查重排除自身；不存在 → 404）
func (s *FriendLinkService) Update(ctx context.Context, id uint64, name, url, description, image string) (*FriendLinkDTO, error) {
	link, err := s.fields(name, url, description, image)
	if err != nil {
		return nil, err
	}
	old, err := s.svc.Repo.GetFriendLinkByID(ctx, id)
	if err != nil {
		return nil, errServer(err)
	}
	if old == nil {
		return nil, errNotFound("友链不存在")
	}
	if err := s.checkURLAvailable(ctx, url, id); err != nil {
		return nil, err
	}
	link.ID = old.ID
	if err := s.svc.Repo.UpdateFriendLink(ctx, link); err != nil {
		if errors.Is(err, repository.ErrDupFriendURL) {
			return nil, errDupFriendURL()
		}
		return nil, errServer(err)
	}
	return toFriendLinkDTO(link), nil
}

// Delete 删除友链（#F4，物理删除；不存在 → 幂等成功，无 404）
func (s *FriendLinkService) Delete(ctx context.Context, id uint64) error {
	if err := s.svc.Repo.DeleteFriendLinkByID(ctx, id); err != nil {
		return errServer(err)
	}
	return nil
}

// checkURLAvailable url 前置查重（excludeID>0 表示编辑场景排除自身），命中 → 409
func (s *FriendLinkService) checkURLAvailable(ctx context.Context, url string, excludeID uint64) error {
	var (
		exists bool
		err    error
	)
	if excludeID > 0 {
		exists, err = s.svc.Repo.ExistsFriendLinkURLExcluding(ctx, url, excludeID)
	} else {
		exists, err = s.svc.Repo.ExistsFriendLinkURL(ctx, url)
	}
	if err != nil {
		return errServer(err)
	}
	if exists {
		return errDupFriendURL()
	}
	return nil
}

// errDupFriendURL 409 文案（#F2：SELECT 前置与 1062 兜底同文案）
func errDupFriendURL() *Error {
	return errConflict("该链接地址已存在")
}
