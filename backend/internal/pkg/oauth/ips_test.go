package oauth

import "testing"

// TestGitHubClientRetryBudget 锁定重试预算：IP 尝试次数决定总超时，
// 多打一个 IP 就多 5s，会挤占 Exchange 的 20s 总预算并让 DNS 兜底轮不到
func TestGitHubClientRetryBudget(t *testing.T) {
	cases := []struct {
		name string
		ips  []string
		want int // retryTransport.tries，实际尝试次数 = tries+1
	}{
		{"dns only", nil, 2}, // 复用共享 _httpClient：纯 DNS 重试 2 次
		{"one ip then dns", []string{"192.0.2.1"}, 1},
		{"two ips then dns", []string{"192.0.2.1", "192.0.2.2"}, 2},
		{"extra ips capped", []string{"192.0.2.1", "192.0.2.2", "192.0.2.3"}, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := githubClient(tc.ips)
			rt, ok := c.Transport.(*retryTransport)
			if !ok {
				t.Fatalf("transport type = %T, want *retryTransport", c.Transport)
			}
			if rt.tries != tc.want {
				t.Fatalf("tries = %d, want %d", rt.tries, tc.want)
			}
		})
	}
}
