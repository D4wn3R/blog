package service

import (
	"context"

	"github.com/man-mu/blog/backend/internal/config"
	"github.com/man-mu/blog/backend/internal/pkg/oauth"
	"github.com/man-mu/blog/backend/internal/pkg/redis"
	"github.com/man-mu/blog/backend/internal/pkg/rustfs"
	"github.com/man-mu/blog/backend/internal/repository"
)

// Service 业务逻辑层，按模块拆分子服务，事务边界在本层与 repository
type Service struct {
	Repo   *repository.Repository
	Redis  *redis.Client
	RustFS *rustfs.Client
	Reg    *oauth.Registry
	Cfg    *config.Config

	// 认证模块子服务
	OAuth *OAuthService // OAuth 登录/绑定（#1~#4）
	Auth  *AuthService  // 凭证签发/轮换/登出（#5~#7）
	User  *UserService  // 当前用户信息/解绑（#8/#9）

	// 业务模块子服务
	Article    *ArticleService    // 文章/分类/标签/归档（#A1~#A15）
	Comment    *CommentService    // 评论楼中楼（#C1~#C3）
	Moment     *MomentService     // 个人动态（#M1~#M4）
	FriendLink *FriendLinkService // 友链（#F1~#F4）
	About      *AboutService      // 关于页/站点设置（#B1~#B18）
	Upload     *UploadService     // 图片上传（#U1）：转码 WebP 后服务端写桶
	Feed       *FeedService       // RSS 订阅源（/feed.xml）
}

// New 组装业务层：各子服务共享 Repo/Redis/RustFS/OAuth 注册表与配置，事务边界在子服务
func New(repo *repository.Repository, rdb *redis.Client, mc *rustfs.Client, reg *oauth.Registry, cfg *config.Config) *Service {
	s := &Service{Repo: repo, Redis: rdb, RustFS: mc, Reg: reg, Cfg: cfg}
	s.OAuth = &OAuthService{svc: s}
	s.Auth = &AuthService{svc: s}
	s.User = &UserService{svc: s}
	s.Article = &ArticleService{svc: s}
	s.Comment = &CommentService{svc: s}
	s.Moment = &MomentService{svc: s}
	s.FriendLink = &FriendLinkService{svc: s}
	s.About = &AboutService{svc: s}
	s.Upload = &UploadService{
		svc:       s,
		transcode: transcodeFFmpeg,
		put: func(ctx context.Context, objectKey, contentType string, data []byte) error {
			return s.RustFS.PutObject(ctx, objectKey, contentType, data)
		},
	}
	s.Feed = &FeedService{svc: s}
	return s
}

// Ready 就绪探针（/readyz 用）：MySQL 与 Redis 连通性检查，任一不可达返回错误
func (s *Service) Ready(ctx context.Context) error {
	sqlDB, err := s.Repo.DB().DB()
	if err != nil {
		return err
	}
	if err := sqlDB.PingContext(ctx); err != nil {
		return err
	}
	return s.Redis.Ping(ctx).Err()
}
