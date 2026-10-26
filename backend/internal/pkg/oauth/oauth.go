// Package oauth 第三方登录提供方（GitHub）：授权跳转、授权码换用户信息、网络层重试与 IP 轮换
package oauth

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// retryTransport 网络层错误自动重试：国内服务器到 github.com 的 TLS 握手存在
// 间歇性干扰（TCP 可达但 TLS 阶段被掐断直至超时），握手失败意味着请求未到达对端，
// 重试安全；最多再试 2 次，退避 300ms/900ms。5xx 不重试（对端已明确响应）。
type retryTransport struct {
	base  http.RoundTripper
	tries int
}

func (t *retryTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// GetBody 兜底：不依赖上游请求构造是否预设（重试需要完整重放 body）
	if req.Body != nil && req.GetBody == nil {
		buf, err := io.ReadAll(req.Body)
		if err != nil {
			return nil, err
		}
		_ = req.Body.Close()
		req.Body = io.NopCloser(bytes.NewReader(buf))
		req.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(buf)), nil
		}
	}
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	var lastErr error
	for i := 0; i <= t.tries; i++ {
		if i > 0 {
			// 退避必须感知 context：否则 Exchange 的 20s 总预算会被 Sleep 拖破
			backoff := time.Duration(300*(1<<uint(i-1))) * time.Millisecond
			select {
			case <-time.After(backoff):
			case <-req.Context().Done():
				return nil, req.Context().Err()
			}
			req = req.Clone(req.Context())
			if req.GetBody != nil {
				if body, err := req.GetBody(); err == nil {
					req.Body = body
				}
			}
		}
		// 尝试序号进 context：配合 rotatingDialer 在重试时轮换连接 IP
		// （TLS 干扰是间歇的，换 IP 重试比原地重试成功率高得多）
		attemptCtx := context.WithValue(req.Context(), attemptKey{}, i)
		resp, err := base.RoundTrip(req.WithContext(attemptCtx))
		if err == nil {
			return resp, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

// _httpClient 调第三方 OAuth API 的共享客户端。
// 第三方服务可用性不受我方控制，必须带超时，防止挂起请求无限堆积 goroutine；
// 10s 单次超时 + 网络错误重试 2 次（见 retryTransport）
var _httpClient = &http.Client{Timeout: 10 * time.Second, Transport: &retryTransport{tries: 2}}

// sanitizeURLError 剥离 *url.Error 中的完整 URL：授权/交换请求 URL 可能携带
// client_id / redirect_uri 等参数，*url.Error.Error() 会原样带出完整 URL，落日志即泄漏。
// 只保留方法与底层原因（超时、连接拒绝等），足以排障。
func sanitizeURLError(err error) error {
	var ue *url.Error
	if errors.As(err, &ue) {
		return fmt.Errorf("%s request failed: %w", ue.Op, ue.Err)
	}
	return err
}

// UserInfo 第三方平台返回的用户信息
type UserInfo struct {
	ProviderID string // GitHub 用户 id
	Nickname   string
	Avatar     string
	Email      string
}

// Provider 第三方登录提供方抽象，由各平台实现
type Provider interface {
	Name() string
	// AuthorizeURL 生成跳转授权页的 URL（携带 state 防 CSRF）
	AuthorizeURL(state string) string
	// Exchange 用授权码换取用户信息
	Exchange(ctx context.Context, code string) (*UserInfo, error)
}
