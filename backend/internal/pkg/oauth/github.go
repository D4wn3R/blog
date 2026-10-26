package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/oauth2"
)

// GitHub GitHub OAuth2 实现
type GitHub struct {
	cfg *oauth2.Config
	// client 带 IP 轮换 dialer 的专用客户端（exchange/userinfo/emails 共用）；
	// ips 为空时退回共享 _httpClient（本地开发无干扰场景）
	client *http.Client
}

// NewGitHub 创建 GitHub provider；ips 为 github.com 的候选连接 IP 列表
// （国内服务器 TLS 间歇干扰下的轮换重试，见 ips.go）
func NewGitHub(clientID, clientSecret, redirectURL string, ips []string) *GitHub {
	return &GitHub{
		cfg: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"read:user", "user:email"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://github.com/login/oauth/authorize",
				TokenURL: "https://github.com/login/oauth/access_token",
			},
		},
		client: githubClient(ips),
	}
}

// Name 平台名（注册表键）
func (g *GitHub) Name() string { return "github" }

// AuthorizeURL 生成 GitHub 授权页跳转地址（携带 state）
func (g *GitHub) AuthorizeURL(state string) string {
	return g.cfg.AuthCodeURL(state)
}

// Exchange 授权码换用户信息：token 交换 → /user 资料 → 私有邮箱经 /user/emails 兜底
func (g *GitHub) Exchange(ctx context.Context, code string) (*UserInfo, error) {
	// 整个换取流程限 20s（网络层重试 2 次见 retryTransport，需留总预算），
	// 防止 GitHub 服务挂起拖垮请求
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	// token 交换段走 github 专用客户端（IP 轮换重试）；错误脱敏防 secret 进日志
	tok, err := g.cfg.Exchange(context.WithValue(ctx, oauth2.HTTPClient, g.client), code)
	if err != nil {
		return nil, fmt.Errorf("github exchange token: %w", sanitizeURLError(err))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github fetch user: %w", err)
	}
	defer func() { _ = resp.Body.Close() }() // 读完即弃，关闭失败无需处理

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github fetch user: status %d", resp.StatusCode)
	}

	var user struct {
		ID     int64  `json:"id"`
		Login  string `json:"login"`
		Name   string `json:"name"`
		Avatar string `json:"avatar_url"`
		Email  string `json:"email"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return nil, err
	}

	nickname := user.Name
	if nickname == "" {
		nickname = user.Login
	}
	// email 私有时 /user 返回空，用 /user/emails 兜底取主邮箱；失败不阻断登录
	email := user.Email
	if email == "" {
		email, _ = g.primaryEmail(ctx, tok.AccessToken)
	}
	return &UserInfo{
		ProviderID: fmt.Sprintf("%d", user.ID),
		Nickname:   nickname,
		Avatar:     user.Avatar,
		Email:      email,
	}, nil
}

// primaryEmail 从 /user/emails 获取已验证的主邮箱
func (g *GitHub) primaryEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }() // 读完即弃，关闭失败无需处理
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github fetch emails: status %d", resp.StatusCode)
	}

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	return "", nil
}
