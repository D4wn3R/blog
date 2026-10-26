package service

import (
	"context"
	"errors"
	"strconv"

	"github.com/redis/go-redis/v9"

	"github.com/man-mu/blog/backend/internal/model"
	appjwt "github.com/man-mu/blog/backend/internal/pkg/jwt"
)

// AuthService 凭证子服务：auth_code 换凭证 / refresh 轮换 / 登出（#5~#7）
type AuthService struct {
	svc *Service
}

// TokenPair #5/#6 响应体：凭证对 + 登录用户（登录瞬间即可渲染，免再调 /me）
type TokenPair struct {
	AccessToken  string   `json:"access_token"`
	ExpiresIn    int64    `json:"expires_in"`
	RefreshToken string   `json:"refresh_token"`
	User         *UserDTO `json:"user"`
}

// Exchange auth_code 换凭证对（#5，公开）。
// GETDEL 先消费后查库为安全优先取舍（spec §7.4）：防重放窗口，MySQL 挂则 auth_code 白费
func (s *AuthService) Exchange(ctx context.Context, code string) (*TokenPair, error) {
	raw, err := s.svc.Redis.GetDel(ctx, _authCodeKeyPrefix+code).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, errNotFound("登录已过期，请重新登录")
		}
		return nil, errServer(err)
	}
	uid, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return nil, errNotFound("登录已过期，请重新登录")
	}
	user, err := s.svc.Repo.GetUserByID(ctx, uid)
	if err != nil {
		return nil, errServer(err)
	}
	if user == nil {
		return nil, errNotFound("用户不存在") // 防御性兜底
	}
	// 复查 status：防 callback→exchange 60s 窗口内被禁仍签发 30d 凭证
	if user.Status == model.UserStatusBanned {
		return nil, errForbidden("账号已被禁用")
	}
	return s.issueTokens(ctx, uid)
}

// Refresh refresh 轮换（#6，公开）：GETDEL 严格轮换，旧 token 随每次刷新立即作废无宽限期。
// 401 统一文案"登录已过期，请重新登录"，前端跳登录不重试
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	raw, err := s.svc.Redis.GetDel(ctx, _refreshKeyPrefix+refreshToken).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			// 过期/已轮换/伪造/已登出，一律同一话术不区分
			return nil, errUnauthorized("登录已过期，请重新登录")
		}
		return nil, errServer(err)
	}
	uid, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return nil, errUnauthorized("登录已过期，请重新登录")
	}
	user, err := s.svc.Repo.GetUserByID(ctx, uid)
	if err != nil {
		return nil, errServer(err)
	}
	if user == nil {
		return nil, errUnauthorized("登录已过期，请重新登录")
	}
	// 禁用 → 403；此时旧 refresh 已被消费 = 踢下线
	if user.Status == model.UserStatusBanned {
		return nil, errForbidden("账号已被禁用")
	}
	return s.issueTokens(ctx, uid)
}

// Logout 登出（#7，需登录）：归属校验防探测——token 不存在静默成功（幂等语义），
// uid 不符静默成功（不删不报错）；三步非原子竞态无害，不上 Lua（spec §9.6）。
// 只删这一枚 refresh（多标签页共享 localStorage 同一 token，删它 = 该浏览器全部下线）
func (s *AuthService) Logout(ctx context.Context, userID uint64, refreshToken string) error {
	raw, err := s.svc.Redis.Get(ctx, _refreshKeyPrefix+refreshToken).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil // 不存在 → 静默成功（幂等）
		}
		return errServer(err) // 前端可忽略，继续本地清理
	}
	uid, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || uid != userID {
		return nil // 归属不符 → 静默成功（防探测）
	}
	if err := s.svc.Redis.Del(ctx, _refreshKeyPrefix+refreshToken).Err(); err != nil {
		return errServer(err)
	}
	return nil
}

// issueTokens 签发凭证对（#5/#6 共用，勿抄两份）：签 access JWT + 生成 refresh 存 Redis + 查 user 拼 DTO
func (s *AuthService) issueTokens(ctx context.Context, uid uint64) (*TokenPair, error) {
	// user 重新查库：角色/昵称变更后刷新即生效
	user, err := s.svc.Repo.GetUserByID(ctx, uid)
	if err != nil {
		return nil, errServer(err)
	}
	if user == nil {
		return nil, errNotFound("用户不存在")
	}
	access, err := appjwt.Sign(s.svc.Cfg.JWT.Secret, s.svc.Cfg.JWT.AccessExpire, &appjwt.Claims{
		UserID: user.ID,
		Role:   user.Role,
	})
	if err != nil {
		return nil, errServer(err)
	}
	refresh, err := randomToken()
	if err != nil {
		return nil, errServer(err)
	}
	if err := s.svc.Redis.Set(ctx, _refreshKeyPrefix+refresh, user.ID, s.svc.Cfg.JWT.RefreshExpire).Err(); err != nil {
		return nil, errServer(err)
	}
	return &TokenPair{
		AccessToken:  access,
		ExpiresIn:    int64(s.svc.Cfg.JWT.AccessExpire.Seconds()),
		RefreshToken: refresh,
		User:         toUserDTO(user),
	}, nil
}
