package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"

	"github.com/redis/go-redis/v9"

	"github.com/man-mu/blog/backend/internal/model"
	"github.com/man-mu/blog/backend/internal/pkg/logctx"
	"github.com/man-mu/blog/backend/internal/pkg/oauth"
	"github.com/man-mu/blog/backend/internal/pkg/randx"
	"github.com/man-mu/blog/backend/internal/repository"
)

// OAuthService OAuth 登录/绑定子服务（#1~#4）
type OAuthService struct {
	svc *Service
}

// Authorize 登录跳转（#2，公开）：生成 uid=0 的 state 存 Redis EX 300，返回平台授权页 URL。
// Redis 写失败时尚未离站，可返回 JSON 50000
func (s *OAuthService) Authorize(ctx context.Context, providerName string) (string, error) {
	p, ok := s.svc.Reg.Get(providerName)
	if !ok {
		return "", errNotFound("不支持的登录方式")
	}
	authorizeURL, err := s.saveState(ctx, 0, p)
	if err != nil {
		return "", errServer(err)
	}
	return authorizeURL, nil
}

// BindState 绑定跳转（#4，需登录，两段式）：生成 uid=当前用户的 state，返回 authorize_url 交前端立即跳转。
// 两段式根因（勿回退，spec §4 #4）：浏览器导航请求带不了 Authorization 头，
// fetch 跟随 302 又拿不到 Location，加 CORS 救不回，唯一干净形态就是 fetch 换 URL 后 location.href
func (s *OAuthService) BindState(ctx context.Context, userID uint64, providerName string) (string, error) {
	p, ok := s.svc.Reg.Get(providerName)
	if !ok {
		return "", errNotFound("不支持的登录方式")
	}
	// 前置检查：已绑同平台 → 快速失败省一圈授权跳转（并发正确性由 uk_user_provider 兜底）
	bound, err := s.svc.Repo.GetUserOAuthAccount(ctx, userID, providerName)
	if err != nil {
		return "", errServer(err)
	}
	if bound != nil {
		return "", errConflict("该平台已绑定，请先解绑")
	}
	return s.saveState(ctx, userID, p)
}

// saveState 生成 state（uid=0 登录 / uid>0 绑定）存 Redis EX 300，返回平台授权页 URL
func (s *OAuthService) saveState(ctx context.Context, uid uint64, p oauth.Provider) (string, error) {
	state, err := randomToken()
	if err != nil {
		return "", err
	}
	v, err := json.Marshal(stateValue{Provider: p.Name(), UID: uid})
	if err != nil {
		return "", err
	}
	if err := s.svc.Redis.Set(ctx, _stateKeyPrefix+state, v, _stateTTL).Err(); err != nil {
		return "", err
	}
	return p.AuthorizeURL(state), nil
}

// Callback 回调处理（#3，公开）：登录/绑定的统一入口。
// 返回 302 回前端的 query（code=xx / bind=xx / error=xx）——任何失败路径（业务失败 + 基础设施异常）
// 都收敛为 error=xxx 而非向上抛错，由 handler 统一 302，杜绝任何路径漏成 JSON（spec 总则 3）
func (s *OAuthService) Callback(ctx context.Context, pathProvider, cbError, code, state string) url.Values {
	// state 参数存在即先 GETDEL 原子消费（spec 流程步骤 2 先于一切业务分支）：
	// 缺 code / error 回调等提前分派若跳过消费，state 会残留至 TTL，可被拼接他人 code 复用
	// （绑定 state 残留 = 账号接管向量），一次性语义必须无条件生效
	var sv stateValue
	stateValid := false
	if state != "" {
		raw, err := s.svc.Redis.GetDel(ctx, _stateKeyPrefix+state).Result()
		switch {
		case err == nil:
			if json.Unmarshal([]byte(raw), &sv) == nil && sv.Provider == pathProvider {
				stateValid = true
			}
		case errors.Is(err, redis.Nil):
			// 过期/伪造/已用：stateValid 保持 false，分派仍按下方优先级走
		default:
			// Redis 瞬断等其他错误：基础设施异常统一收敛 oauth_failed，
			// 瞬断误报成"已过期"会让用户疯狂重走 OAuth 也过不去（spec §7.3）
			logCallbackErr(ctx, pathProvider, "state_getdel", err)
			return oauthFailedQuery()
		}
	}
	// 错误分派（spec §4 #3 表）：error 参数优先——GitHub 真取消 = access_denied，
	// 其余（如 application_suspended）一律 oauth_failed
	if cbError != "" {
		if cbError == "access_denied" {
			return url.Values{"error": {"denied"}}
		}
		return oauthFailedQuery()
	}
	// 缺 state / state 校验失败 → state_expired；缺 code（用户中途取消等无 error 参数的
	// 情形）→ oauth_failed——走到这里 state 必已被消费，无残留
	if !stateValid {
		return url.Values{"error": {"state_expired"}}
	}
	if code == "" {
		return oauthFailedQuery()
	}
	p, ok := s.svc.Reg.Get(pathProvider)
	if !ok {
		// state 校验通过但注册表无此平台：理论不可达（state 只为已注册平台生成），兜底
		return oauthFailedQuery()
	}
	// Exchange 调平台 API 换用户信息（10s 超时），网络等基础设施异常收敛 oauth_failed
	info, err := p.Exchange(ctx, code)
	if err != nil {
		logCallbackErr(ctx, pathProvider, "exchange", err)
		return oauthFailedQuery()
	}
	if sv.UID == 0 {
		return s.loginBranch(ctx, pathProvider, info)
	}
	return s.bindBranch(ctx, sv.UID, pathProvider, info)
}

// loginBranch 登录分支（state.uid=0）：命中绑定则查用户，未命中事务建号，成功发 auth_code
func (s *OAuthService) loginBranch(ctx context.Context, provider string, info *oauth.UserInfo) url.Values {
	user, err := s.svc.Repo.GetUserByProvider(ctx, provider, info.ProviderID)
	if err != nil {
		logCallbackErr(ctx, provider, "login_lookup", err)
		return oauthFailedQuery()
	}
	if user == nil {
		user, err = s.createLoginUser(ctx, provider, info)
		if errors.Is(err, repository.ErrDupProviderBinding) || errors.Is(err, repository.ErrDupUserBinding) {
			// 并发建号竞态：撞唯一索引说明另一请求已建号绑定，重查该 (provider, provider_id) 当"命中"处理
			user, err = s.svc.Repo.GetUserByProvider(ctx, provider, info.ProviderID)
		}
		if err != nil || user == nil {
			logCallbackErr(ctx, provider, "login_create", err)
			return oauthFailedQuery()
		}
	} else {
		// 命中已有绑定：同步第三方最新资料到 users（seed 预建账号的补齐点）。
		// 非关键路径，失败仅记日志不阻断登录——影响的只是头像/邮箱新鲜度
		if err := s.svc.Repo.SyncUserProfileFromOAuth(ctx, user.ID, info.Avatar, info.Email); err != nil {
			logCallbackErr(ctx, provider, "profile_sync", err)
		}
	}
	// 禁用账号不放行
	if user.Status == model.UserStatusBanned {
		return url.Values{"error": {"banned"}}
	}
	// 生成 auth_code 存 Redis EX 60，前端拿它 POST /auth/exchange 换凭证对
	authCode, err := randomToken()
	if err != nil {
		logCallbackErr(ctx, provider, "authcode_generate", err)
		return oauthFailedQuery()
	}
	if err := s.svc.Redis.Set(ctx, _authCodeKeyPrefix+authCode, user.ID, _authCodeTTL).Err(); err != nil {
		logCallbackErr(ctx, provider, "authcode_store", err)
		return oauthFailedQuery()
	}
	return url.Values{"code": {authCode}}
}

// createLoginUser 事务建号（spec §2.3 建号规则）。
// users.username 撞唯一索引（并发同名昵称竞态）→ 换随机后缀重试；
// oauth_accounts 撞唯一索引 → 原样上抛，由调用方重查当"命中"处理
func (s *OAuthService) createLoginUser(ctx context.Context, provider string, info *oauth.UserInfo) (*model.User, error) {
	base, err := s.genUsername(ctx, info.Nickname)
	if err != nil {
		return nil, err
	}
	username := base
	for attempt := 0; attempt < 3; attempt++ {
		user := &model.User{
			Username: username,
			Email:    info.Email, // GitHub 为 primary+verified 邮箱或空
			Avatar:   info.Avatar,
			Role:     model.RoleUser,
			Status:   model.UserStatusNormal,
		}
		account := &model.OAuthAccount{
			Provider:   provider,
			ProviderID: info.ProviderID,
			Nickname:   info.Nickname, // 第三方快照仅建绑定时写一次，平台改名不改库
			Avatar:     info.Avatar,
		}
		err = s.svc.Repo.CreateUserWithAccount(ctx, user, account)
		if err == nil {
			return user, nil
		}
		if !errors.Is(err, repository.ErrDupUsername) {
			return nil, err
		}
		// 并发同名竞态：截断后追加新的 4 位随机 hex 后缀重试
		username = truncateRunes(base, _maxUsernameLen-4) + randx.Hex(4)
	}
	return nil, err
}

const _maxUsernameLen = 50 // users.username 列宽

// genUsername 由平台昵称生成用户名（spec §2.3）：截断 50 字符，查重冲突追加 4 位随机 hex 后缀；
// 昵称为空用 "user_" + 4 位随机数
func (s *OAuthService) genUsername(ctx context.Context, nickname string) (string, error) {
	base := truncateRunes(nickname, _maxUsernameLen)
	if base == "" {
		return "user_" + randx.Digits4(), nil
	}
	exists, err := s.svc.Repo.ExistsUsername(ctx, base)
	if err != nil {
		return "", err
	}
	if exists {
		base = truncateRunes(base, _maxUsernameLen-4) + randx.Hex(4)
	}
	return base, nil
}

// bindBranch 绑定分支（state.uid>0）：前置检查给友好文案，并发正确性由双唯一索引兜底
func (s *OAuthService) bindBranch(ctx context.Context, userID uint64, provider string, info *oauth.UserInfo) url.Values {
	// 前置检查一：(provider, provider_id) 已绑他人 → already_bound（绑给自己则落入下方 provider_exists）
	acc, err := s.svc.Repo.GetOAuthAccountByProviderID(ctx, provider, info.ProviderID)
	if err != nil {
		logCallbackErr(ctx, provider, "bind_lookup_provider", err)
		return oauthFailedQuery()
	}
	if acc != nil && acc.UserID != userID {
		return url.Values{"error": {"already_bound"}}
	}
	// 前置检查二：本人已绑同平台 → provider_exists
	own, err := s.svc.Repo.GetUserOAuthAccount(ctx, userID, provider)
	if err != nil {
		logCallbackErr(ctx, provider, "bind_lookup_user", err)
		return oauthFailedQuery()
	}
	if own != nil {
		return url.Values{"error": {"provider_exists"}}
	}
	account := &model.OAuthAccount{
		UserID:     userID,
		Provider:   provider,
		ProviderID: info.ProviderID,
		Nickname:   info.Nickname,
		Avatar:     info.Avatar,
	}
	if err := s.svc.Repo.CreateOAuthAccount(ctx, account); err != nil {
		// 前置检查与插入之间的并发窗口由唯一索引兜底，按撞哪条唯一索引映射错误码
		switch {
		case errors.Is(err, repository.ErrDupProviderBinding):
			return url.Values{"error": {"already_bound"}}
		case errors.Is(err, repository.ErrDupUserBinding):
			return url.Values{"error": {"provider_exists"}}
		}
		logCallbackErr(ctx, provider, "bind_insert", err)
		return oauthFailedQuery()
	}
	// 成功 → 302 ?bind={provider}（值即平台名）
	return url.Values{"bind": {provider}}
}

// oauthFailedQuery 基础设施异常统一收敛的 302 query（spec §4 #3）
func oauthFailedQuery() url.Values {
	return url.Values{"error": {"oauth_failed"}}
}

// logCallbackErr callback 基础设施异常的统一留痕：对外一律 302 oauth_failed（spec 总则 3），
// 但访问日志只见 302，服务端无此日志则生产排障等于盲人摸象。日志走请求 context 的
// slog logger（RequestID 中间件注入），自动携带 request_id。
// err 已在 pkg/oauth 层脱敏（sanitizeURLError），不含 client_secret / access_token
func logCallbackErr(ctx context.Context, provider, stage string, err error) {
	logctx.From(ctx).Error("oauth callback failed", "provider", provider, "stage", stage, "err", err)
}

// truncateRunes 按字符数截断（昵称含中文时按 rune 计，避免按字节截断产生乱码）
func truncateRunes(s string, n int) string {
	rs := []rune(s)
	if len(rs) <= n {
		return s
	}
	return string(rs[:n])
}
