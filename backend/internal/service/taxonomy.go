package service

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/man-mu/blog/backend/internal/model"
	"github.com/man-mu/blog/backend/internal/repository"
)

// 分类名/标签名 rune 上限即列宽（schema §2.3，uk_categories_name / uk_tags_name 唯一索引）
const (
	_categoryNameMaxRunes = 50
	_tagNameMaxRunes      = 50
)

// CategoryDTO 分类白名单（#A2/#A5/#A9）
type CategoryDTO struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

// TagDTO 标签白名单（#A2/#A5/#A12）
type TagDTO struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

// toTagDTOs model.Tag → TagDTO 列表（保证非 nil，README 禁空列表序列化为 null）
func toTagDTOs(tags []model.Tag) []TagDTO {
	out := make([]TagDTO, 0, len(tags))
	for i := range tags {
		out = append(out, TagDTO{ID: tags[i].ID, Name: tags[i].Name})
	}
	return out
}

// ---------- 分类（#A9~#A11） ----------

// ListCategories 分类列表（#A9）：used=true 仅返回已挂靠已发布文章的分类（C 端筛选条），
// 缺省全量（B 端候选池依赖全量语义不变）；id ASC
func (s *ArticleService) ListCategories(ctx context.Context, used bool) ([]CategoryDTO, error) {
	var (
		list []model.Category
		err  error
	)
	if used {
		list, err = s.svc.Repo.ListCategoriesInUse(ctx)
	} else {
		list, err = s.svc.Repo.ListCategories(ctx)
	}
	if err != nil {
		return nil, errServer(err)
	}
	out := make([]CategoryDTO, 0, len(list))
	for i := range list {
		out = append(out, CategoryDTO{ID: list[i].ID, Name: list[i].Name})
	}
	return out, nil
}

// CreateCategory 创建分类（#A10）：TrimSpace + rune ≤ 50，重名 → 409；成功返回创建的 DTO（自增 ID 由 GORM 回填）
func (s *ArticleService) CreateCategory(ctx context.Context, name string) (CategoryDTO, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return CategoryDTO{}, errBadRequest("分类名不能为空")
	}
	if utf8.RuneCountInString(name) > _categoryNameMaxRunes {
		return CategoryDTO{}, errBadRequest("分类名过长")
	}
	c, err := s.svc.Repo.CreateCategory(ctx, name)
	if err != nil {
		if errors.Is(err, repository.ErrDupCategoryName) {
			return CategoryDTO{}, errConflict("分类名已存在")
		}
		return CategoryDTO{}, errServer(err)
	}
	return CategoryDTO{ID: c.ID, Name: c.Name}, nil
}

// DeleteCategory 删除分类（#A11）：事务内 FOR UPDATE 锁行 + COUNT 文章（status 1/2 任意），
// 有文章 → 409 拒绝，外键 RESTRICT 为 DB 层兜底；分类不存在静默成功（契约 #A11 仅定义 409 拦截）
func (s *ArticleService) DeleteCategory(ctx context.Context, id uint64) error {
	err := s.svc.Repo.DeleteCategory(ctx, id)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, repository.ErrCategoryInUse):
		return errConflict("该分类下仍有文章，请先迁移或删除文章后再删除分类")
	}
	return errServer(err)
}

// ---------- 标签（#A12~#A14） ----------

// ListTags 全量标签列表（#A12），id ASC
func (s *ArticleService) ListTags(ctx context.Context) ([]TagDTO, error) {
	list, err := s.svc.Repo.ListTags(ctx)
	if err != nil {
		return nil, errServer(err)
	}
	out := make([]TagDTO, 0, len(list))
	for i := range list {
		out = append(out, TagDTO{ID: list[i].ID, Name: list[i].Name})
	}
	return out, nil
}

// CreateTag 创建标签（#A13）：校验同 #A10，重名文案换成标签；成功返回创建的 DTO（自增 ID 由 GORM 回填）
func (s *ArticleService) CreateTag(ctx context.Context, name string) (TagDTO, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return TagDTO{}, errBadRequest("标签名不能为空")
	}
	if utf8.RuneCountInString(name) > _tagNameMaxRunes {
		return TagDTO{}, errBadRequest("标签名过长")
	}
	t, err := s.svc.Repo.CreateTag(ctx, name)
	if err != nil {
		if errors.Is(err, repository.ErrDupTagName) {
			return TagDTO{}, errConflict("标签名已存在")
		}
		return TagDTO{}, errServer(err)
	}
	return TagDTO{ID: t.ID, Name: t.Name}, nil
}

// DeleteTag 删除标签（#A14）：事务内先显式清 article_tags 再物理删标签；
// 不存在 → 404（与 #A11 分类不存在静默成功刻意不同，契约 #A14 明确）
func (s *ArticleService) DeleteTag(ctx context.Context, id uint64) error {
	existed, err := s.svc.Repo.DeleteTag(ctx, id)
	if err != nil {
		return errServer(err)
	}
	if !existed {
		return errNotFound("标签不存在")
	}
	return nil
}
