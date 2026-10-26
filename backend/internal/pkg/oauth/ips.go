package oauth

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"
)

// attemptKey 重试序号的 context 键：retryTransport 每次重试递增，
// rotatingDialer 据此轮换实际连接的 IP
type attemptKey struct{}

// RotatingDialer 构造按尝试序号轮换连接 IP 的 DialContext。
// 背景：国内服务器到 github.com 的干扰是 TCP 可达但 TLS 握手被掐到超时——
// 干扰发生在 TLS 层，dial 层（TCP）感知不到，固定 /etc/hosts 的单一 IP 会被
// 动态封锁轮流掐掉。方案：重试时换连接 IP（TLS SNI/Host 头仍是原域名，证书校验不受影响）。
// ips 为空则返回普通 dialer（不轮换）。
func RotatingDialer(ips []string, timeout time.Duration) func(ctx context.Context, network, addr string) (net.Conn, error) {
	if len(ips) == 0 {
		return (&net.Dialer{Timeout: timeout}).DialContext
	}
	base := &net.Dialer{Timeout: timeout}
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil || !isRotatingHost(host) {
			return base.DialContext(ctx, network, addr)
		}
		// 从 context 取尝试序号（缺省 0 = 首选 IP），按序轮换
		attempt := 0
		if v, ok := ctx.Value(attemptKey{}).(int); ok {
			attempt = v
		}
		// 候选 IP 用尽后回退系统 DNS：硬编码 IP 会随 GitHub 边缘轮换失效，
		// 没有兜底时一次配置过期就会让整条登录链路不可用
		if attempt >= len(ips) {
			return base.DialContext(ctx, network, addr)
		}
		ip := ips[attempt]
		return base.DialContext(ctx, network, net.JoinHostPort(ip, port))
	}
}

// isRotatingHost 只有 github.com 参与 IP 轮换：
// ⚠️ api.github.com 不轮换——它的解析 IP 与 github.com 的 IP 池不同源，
// 把 api.github.com 的请求 dial 到 github.com 的 IP 会被 GitHub 边缘按 Host
// 路由到错误后端（实测返回 406）。api.github.com 直连一直稳定，走正常解析
func isRotatingHost(host string) bool {
	return strings.TrimSuffix(host, ".") == "github.com"
}

// _maxIPAttempts 候选 IP 最多尝试次数：多打一个 IP 就多 5s，
// 会挤占 Exchange 的 20s 总预算，DNS 兜底反而轮不到
const _maxIPAttempts = 2

// githubClient 为 github.com 构造 HTTP 客户端：前 len(ips) 次尝试轮换候选 IP，
// 最后一次回退系统 DNS（tries=len(ips) → len(ips)+1 次尝试）。
// ips 为空直接走共享 _httpClient（纯 DNS，本地开发场景）
func githubClient(ips []string) *http.Client {
	if len(ips) == 0 {
		return _httpClient
	}
	if len(ips) > _maxIPAttempts {
		ips = ips[:_maxIPAttempts]
	}
	return &http.Client{
		Timeout: 18 * time.Second, // 兜底总限（3 次 × 5s + 重试退避，受 Exchange ctx 20s 约束）
		Transport: &retryTransport{
			tries: len(ips), // IP 尝试 + 最后一次 DNS 兜底
			base: &http.Transport{
				DialContext:           RotatingDialer(ips, 5*time.Second),
				TLSHandshakeTimeout:   5 * time.Second,
				ResponseHeaderTimeout: 5 * time.Second,
			},
		},
	}
}
