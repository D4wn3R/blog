// Package redis Redis 客户端封装：建连 + Ping 连通性验证。
// 命名字段而非嵌入 go-redis.Client——只委托业务在用的方法，
// 避免把上游全部导出 API 泄露成包公共契约（规范 §5 公共 struct 禁嵌入实现类型）
package redis

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client Redis 客户端（go-redis 薄封装，统一建连与连通性验证）
type Client struct {
	cli *redis.Client
}

// New 连接 Redis 并验证连通性
func New(addr, password string, db int) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	return &Client{cli: rdb}, nil
}

// Get 透传（详见 go-redis）
func (c *Client) Get(ctx context.Context, key string) *redis.StringCmd {
	return c.cli.Get(ctx, key)
}

// Set 透传（详见 go-redis）
func (c *Client) Set(ctx context.Context, key string, value any, expiration time.Duration) *redis.StatusCmd {
	return c.cli.Set(ctx, key, value, expiration)
}

// GetDel 原子取删（一次性令牌语义）
func (c *Client) GetDel(ctx context.Context, key string) *redis.StringCmd {
	return c.cli.GetDel(ctx, key)
}

// Del 透传（详见 go-redis）
func (c *Client) Del(ctx context.Context, keys ...string) *redis.IntCmd {
	return c.cli.Del(ctx, keys...)
}

// Ping 连通性探针
func (c *Client) Ping(ctx context.Context) *redis.StatusCmd {
	return c.cli.Ping(ctx)
}

// Close 关闭连接（幂等）
func (c *Client) Close() error {
	return c.cli.Close()
}
