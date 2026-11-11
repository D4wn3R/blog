// 路由契约：解绑固定 GitHub（站点唯一登录方式），OAuth 协议本身的 :provider 路由保留
package router

import (
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/D4wn3R/blog/backend/internal/config"
	"github.com/D4wn3R/blog/backend/internal/handler"
	"github.com/D4wn3R/blog/backend/internal/pkg/metrics"
	"github.com/D4wn3R/blog/backend/internal/service"
)

func TestOAuthRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{}
	cfg.JWT.Secret = strings.Repeat("x", 32)

	r := New(cfg, handler.New(&service.Service{}, cfg), metrics.New(metrics.Config{}))

	registered := make(map[string]bool, len(r.Routes()))
	for _, route := range r.Routes() {
		registered[route.Method+" "+route.Path] = true
	}

	// 解绑固定为 github；旧的 :provider 参数路由必须不再注册
	if !registered["DELETE /api/user/oauth/github"] {
		t.Error("缺少 DELETE /api/user/oauth/github 路由")
	}
	if registered["DELETE /api/user/oauth/:provider"] {
		t.Error("旧 DELETE /api/user/oauth/:provider 路由仍在注册")
	}

	// OAuth 协议路由按平台名分派（state 防 CSRF 依赖同一路径名），必须保留
	for _, want := range []string{
		"GET /api/oauth/providers",
		"GET /api/oauth/:provider/authorize",
		"GET /api/oauth/:provider/callback",
		"POST /api/oauth/:provider/bind-state",
	} {
		if !registered[want] {
			t.Errorf("缺少 OAuth 协议路由 %s", want)
		}
	}
}
