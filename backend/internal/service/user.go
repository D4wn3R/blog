package service

import (
	"context"
	"errors"

	"github.com/D4wn3R/blog/backend/internal/model"
	"github.com/D4wn3R/blog/backend/internal/repository"
)

// UserService 当前用户子服务：/me 与解绑（#8/#9）
type UserService struct {
	svc *Service
}

// UserDTO 用户信息白名单（#5/#6 响应用，spec §7.1 手写 DTO，禁止序列化 GORM 模型）
type UserDTO struct {
	ID       uint64 `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Avatar   string `json:"avatar"`
	Role     string `json:"role"`
}

// OAuthAccountDTO 绑定信息白名单：openid/user_id/created_at 不得漏出（spec §7.1）；
// provider 固定输出 github（站点唯一登录方式，数据库不再存平台维度）
type OAuthAccountDTO struct {
	Provider string `json:"provider"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
}

// MeDTO /me 响应（#8）：UserDTO 匿名嵌入平铺顶层 + 绑定列表
type MeDTO struct {
	UserDTO
	OAuthAccounts []OAuthAccountDTO `json:"oauth_accounts"`
}

func toUserDTO(u *model.User) *UserDTO {
	return &UserDTO{
		ID:       u.ID,
		Username: u.Username,
		Email:    u.Email,
		Avatar:   u.Avatar,
		Role:     u.Role,
	}
}

// Me 当前用户 + 绑定列表（#8）：显式复查 status（/me 是前端路由守卫锚点，spec §7.10 的例外之一）
func (s *UserService) Me(ctx context.Context, userID uint64) (*MeDTO, error) {
	user, err := s.svc.Repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, errServer(err)
	}
	if user == nil {
		return nil, errUnauthorized("登录已过期，请重新登录") // 用户不存在（防御性）
	}
	if user.Status == model.UserStatusBanned {
		return nil, errForbidden("账号已被禁用")
	}
	list, err := s.svc.Repo.ListOAuthAccountsByUser(ctx, userID)
	if err != nil {
		return nil, errServer(err)
	}
	accounts := make([]OAuthAccountDTO, 0, len(list))
	for i := range list {
		accounts = append(accounts, OAuthAccountDTO{
			Provider: _githubProvider,
			Nickname: list[i].Nickname,
			Avatar:   list[i].Avatar,
		})
	}
	return &MeDTO{UserDTO: *toUserDTO(user), OAuthAccounts: accounts}, nil
}

// Unbind 解绑 GitHub（#9）：事务 + users 行锁串行化该用户的解绑操作，至少保留一个登录方式；
// 物理删除（恢复绑定 = 重新授权重插，语义等价）；解绑不踢线，已签发 token 继续有效
func (s *UserService) Unbind(ctx context.Context, userID uint64) error {
	err := s.svc.Repo.UnbindGitHubAccount(ctx, userID)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, repository.ErrNotBound):
		return errNotFound("未绑定该平台")
	case errors.Is(err, repository.ErrLastBinding):
		return errForbidden("至少保留一个登录方式")
	}
	return errServer(err)
}
