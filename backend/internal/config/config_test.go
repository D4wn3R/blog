// 配置分层契约：敏感项只能来自环境变量，非敏感项来自 configs/config.yaml。
//
// 这组用例锁住两件事：
//  1. env-only 键在 yaml 里缺键时，env 仍能覆盖（viper 的 AutomaticEnv 只认已知键，
//     缺 SetDefault 注册就会静默失效——这是本包最容易被改坏的地方）
//  2. 仓库里的 configs/config.yaml 不得出现任何敏感值（防有人图方便把密码写回去）
package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// writeConfig 在临时目录写一份最小 yaml（只含非敏感项），返回路径
func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("写临时配置: %v", err)
	}
	return path
}

func TestLoadEnvOnlyKeys(t *testing.T) {
	path := writeConfig(t, `
server:
  port: 8080
redis:
  addr: "127.0.0.1:6379"
`)
	// 这些键在 yaml 中完全不存在，只能靠 env + SetDefault 注册生效
	t.Setenv("BLOG_MYSQL_DSN", "root:pw@tcp(127.0.0.1:3306)/blog")
	t.Setenv("BLOG_REDIS_PASSWORD", "redis-pw")
	t.Setenv("BLOG_RUSTFS_ACCESS_KEY", "ak")
	t.Setenv("BLOG_RUSTFS_SECRET_KEY", "sk")
	t.Setenv("BLOG_JWT_SECRET", strings.Repeat("x", 32))
	t.Setenv("BLOG_OAUTH_GITHUB_CLIENT_ID", "cid")
	t.Setenv("BLOG_OAUTH_GITHUB_CLIENT_SECRET", "csecret")
	t.Setenv("BLOG_ADMIN_GITHUB_ID", "240497362")

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.MySQL.DSN != "root:pw@tcp(127.0.0.1:3306)/blog" {
		t.Errorf("mysql.dsn = %q", cfg.MySQL.DSN)
	}
	if cfg.Redis.Password != "redis-pw" {
		t.Errorf("redis.password = %q", cfg.Redis.Password)
	}
	if cfg.RustFS.AccessKey != "ak" || cfg.RustFS.SecretKey != "sk" {
		t.Errorf("rustfs 凭证 = %q/%q", cfg.RustFS.AccessKey, cfg.RustFS.SecretKey)
	}
	if len(cfg.JWT.Secret) != 32 {
		t.Errorf("jwt.secret len = %d", len(cfg.JWT.Secret))
	}
	if cfg.OAuth.GitHub.ClientID != "cid" || cfg.OAuth.GitHub.ClientSecret != "csecret" {
		t.Errorf("github 凭证 = %q/%q", cfg.OAuth.GitHub.ClientID, cfg.OAuth.GitHub.ClientSecret)
	}
	if cfg.Admin.GitHubID != 240497362 {
		t.Errorf("admin.github_id = %d", cfg.Admin.GitHubID)
	}

	// 非敏感项仍来自 yaml
	if cfg.Server.Port != 8080 || cfg.Redis.Addr != "127.0.0.1:6379" {
		t.Errorf("yaml 项被污染: port=%d addr=%q", cfg.Server.Port, cfg.Redis.Addr)
	}
}

// TestLoadNonSecretFromYAML 非敏感项必须能从 yaml 读到，不依赖 env
func TestLoadNonSecretFromYAML(t *testing.T) {
	path := writeConfig(t, `
server:
  port: 9090
  mode: release
redis:
  addr: "10.0.0.1:6380"
  db: 3
rustfs:
  endpoint: "10.0.0.1:9000"
  use_ssl: true
  bucket: "assets"
jwt:
  access_expire: 15m
  refresh_expire: 24h
  unlock_expire: 5m
oauth:
  base_url: "https://example.test"
  github:
    redirect_url: "https://example.test/api/oauth/github/callback"
    ips: ["1.2.3.4", "5.6.7.8"]
cors:
  allowed_origins: ["https://example.test"]
tracing:
  enabled: true
  endpoint: "jaeger:4317"
  insecure: false
  sample_ratio: 0.25
  service_name: "svc"
  environment: "release"
metrics:
  enabled: true
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.Server.Port != 9090 || cfg.Server.Mode != "release" {
		t.Errorf("server = %+v", cfg.Server)
	}
	if cfg.Redis.Addr != "10.0.0.1:6380" || cfg.Redis.DB != 3 {
		t.Errorf("redis = %+v", cfg.Redis)
	}
	if cfg.RustFS.Endpoint != "10.0.0.1:9000" || !cfg.RustFS.UseSSL || cfg.RustFS.Bucket != "assets" {
		t.Errorf("rustfs = %+v", cfg.RustFS)
	}
	if cfg.JWT.AccessExpire != 15*time.Minute || cfg.JWT.RefreshExpire != 24*time.Hour ||
		cfg.JWT.UnlockExpire != 5*time.Minute {
		t.Errorf("jwt 时长 = %v/%v/%v", cfg.JWT.AccessExpire, cfg.JWT.RefreshExpire, cfg.JWT.UnlockExpire)
	}
	if cfg.OAuth.BaseURL != "https://example.test" ||
		cfg.OAuth.GitHub.RedirectURL != "https://example.test/api/oauth/github/callback" {
		t.Errorf("oauth = %+v", cfg.OAuth)
	}
	if len(cfg.OAuth.GitHub.IPs) != 2 {
		t.Errorf("oauth.github.ips = %v", cfg.OAuth.GitHub.IPs)
	}
	if len(cfg.CORS.AllowedOrigins) != 1 || cfg.CORS.AllowedOrigins[0] != "https://example.test" {
		t.Errorf("cors = %v", cfg.CORS.AllowedOrigins)
	}
	if !cfg.Tracing.Enabled || cfg.Tracing.Endpoint != "jaeger:4317" || cfg.Tracing.Insecure ||
		cfg.Tracing.SampleRatio != 0.25 || cfg.Tracing.ServiceName != "svc" ||
		cfg.Tracing.Environment != "release" {
		t.Errorf("tracing = %+v", cfg.Tracing)
	}
	if !cfg.Metrics.Enabled {
		t.Error("metrics.enabled 应为 true")
	}
}

// TestRepoConfigHasNoSecrets 仓库里的 configs/config.yaml 不得包含敏感值。
// 这条防的是"图省事把密码写回 yaml"——仓库是 public 的
func TestRepoConfigHasNoSecrets(t *testing.T) {
	const repoConfig = "../../configs/config.yaml"
	raw, err := os.ReadFile(repoConfig)
	if err != nil {
		t.Fatalf("读取 %s: %v", repoConfig, err)
	}
	text := string(raw)

	// 敏感键不得以赋值形式出现（注释里提到键名是允许的）
	for _, key := range []string{
		"dsn:", "password:", "secret_key:", "access_key:",
		"client_id:", "client_secret:", "secret:",
		"github_id:",
	} {
		for _, line := range strings.Split(text, "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "#") {
				continue // 注释说明允许
			}
			if strings.HasPrefix(trimmed, key) {
				t.Errorf("configs/config.yaml 出现敏感键 %q：%s", key, trimmed)
			}
		}
	}

	// 已知的弱默认值/占位密码不得出现
	for _, banned := range []string{"change-me-in-production", "123456", "rustfsadmin"} {
		if strings.Contains(text, banned) {
			t.Errorf("configs/config.yaml 含占位凭证 %q", banned)
		}
	}
}

// TestEnvOnlyKeysRegistered 每个 env-only 键都必须在 envOnlyKeys 里注册，
// 否则 env 覆盖会静默失效（viper AutomaticEnv 只认已知键）
func TestEnvOnlyKeysRegistered(t *testing.T) {
	registered := make(map[string]bool, len(envOnlyKeys))
	for _, k := range envOnlyKeys {
		registered[k] = true
	}
	want := []string{
		"mysql.dsn",
		"redis.password",
		"rustfs.access_key",
		"rustfs.secret_key",
		"jwt.secret",
		"oauth.github.client_id",
		"oauth.github.client_secret",
		"admin.github_id",
	}
	for _, k := range want {
		if !registered[k] {
			t.Errorf("env-only 键 %q 未在 envOnlyKeys 注册", k)
		}
	}
}
