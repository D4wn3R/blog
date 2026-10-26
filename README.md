# 空中花园 · blog

Go (Gin + GORM) 后端 + React 19 前端 + MySQL / Redis / RustFS，五容器 Docker Compose 一键部署。

## 快速部署

前置要求：Docker（含 Compose v2）、Git、openssl。

```bash
git clone https://github.com/D4wn3R/blog.git
cd blog

# 1. 中间件凭证（MySQL / Redis / RustFS 强随机密码）
cp .env.example .env
sed -i.bak "s/^MYSQL_ROOT_PASSWORD=.*/MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)/" .env
sed -i.bak "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$(openssl rand -hex 16)/" .env
sed -i.bak "s/^RUSTFS_ROOT_PASSWORD=.*/RUSTFS_ROOT_PASSWORD=$(openssl rand -hex 16)/" .env

# 2. 后端配置（登录与管理员）
cd backend && cp .env.example .env && cd ..
#   编辑 backend/.env，最少填三组：
#   - BLOG_JWT_SECRET：≥32 位随机串（openssl rand -hex 32）
#   - BLOG_OAUTH_GITHUB_CLIENT_ID / BLOG_OAUTH_GITHUB_CLIENT_SECRET
#     GitHub → Settings → Developer settings → OAuth Apps 创建，
#     Authorization callback URL 填 http://localhost:8081/api/oauth/github/callback
#     （并同步 BLOG_OAUTH_BASE_URL 与 BLOG_OAUTH_GITHUB_REDIRECT_URL 为同一地址）
#   - BLOG_ADMIN_GITHUB_ID：你的 GitHub 数字 ID
#     （curl https://api.github.com/users/<用户名> 取 id 字段；启动迁移时自动预建
#      管理员并绑定该 GitHub 账号，此后 GitHub 登录即为 admin）

# 3. 构建并启动（backend 启动时自动 migrate 建表）
docker compose up -d --build

# 4. 访问
#    前端：     http://localhost:8081
#    健康检查： http://localhost:8081/api/health
```

> - 首次构建会拉取基础镜像并下载依赖（已内置 goproxy.cn / npmmirror 加速）。
> - 仅支持 GitHub 登录：未配置 GitHub OAuth（BLOG_OAUTH_GITHUB_CLIENT_ID）时后端拒绝启动。
> - 生产部署：`BLOG_SERVER_MODE=release`，并把域名相关变量指向真实站点
>   （BLOG_OAUTH_BASE_URL / BLOG_OAUTH_GITHUB_REDIRECT_URL）；宿主 nginx 将域名反代到容器的 `127.0.0.1:8081` 即可。

## 开发与贡献

开发请走分支 + PR 流程，**不要直接向 `main` 推送**：

```bash
# 1. 从最新 main 开功能分支
git switch -c feat/your-feature origin/main

# 2. 正常提交（Conventional Commits：feat/fix/docs/refactor/test/chore/ci）
git commit -m "feat(editor): 支持粘贴图片自动上传"

# 3. 推送并开 PR
git push -u origin feat/your-feature
gh pr create --base main

# 4. 通过 rebase 合并，保持线性历史
gh pr merge --rebase --delete-branch
```

约定：

- 合并方式统一用 **Rebase merge**（不用 squash / merge commit），保持提交粒度可追溯
- 提交前本地自查：后端 `gofmt -l .`、`goimports -l .`、`go vet ./...`、`go test ./...`；前端 `npm run lint`、`npx tsc -b`、`npm test`、`npm run build`
- 凭证类文件（`.env`、`backend/.env`）永不入库；新增配置项请同步更新对应的 `.env.example`

## License

[MIT](LICENSE)
