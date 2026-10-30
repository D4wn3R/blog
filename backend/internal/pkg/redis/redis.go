// Package redis Redis 客户端封装：建连 + Ping 连通性验证。
// 命名字段而非嵌入 go-redis.Client——只委托业务在用的方法，
// 避免把上游全部导出 API 泄露成包公共契约（规范 §5 公共 struct 禁嵌入实现类型）
package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/extra/redisotel/v9"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel/trace"
)

// Option 建连可选配置
type Option interface {
	apply(*options)
}

// options 未导出配置集合（规范 §7.13：Functional Options 用 Option 接口 + 未导出 struct）
type options struct {
	tracerProvider trace.TracerProvider
}

// tracingOption 挂载 OTel 链路追踪
type tracingOption struct {
	tp trace.TracerProvider
}

func (o tracingOption) apply(opts *options) { opts.tracerProvider = o.tp }

// WithTracerProvider 为每个 Redis 命令生成一个子 span。
// 未传入时不挂任何钩子——链路追踪关闭时保持零额外开销
func WithTracerProvider(tp trace.TracerProvider) Option {
	return tracingOption{tp: tp}
}

// Client Redis 客户端（go-redis 薄封装，统一建连与连通性验证）
type Client struct {
	cli *redis.Client
}

// New 连接 Redis 并验证连通性
func New(addr, password string, db int, opts ...Option) (*Client, error) {
	var o options
	for _, opt := range opts {
		opt.apply(&o)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})
	if o.tracerProvider != nil {
		if err := redisotel.InstrumentTracing(rdb, redisotel.WithTracerProvider(o.tracerProvider)); err != nil {
			_ = rdb.Close()
			return nil, fmt.Errorf("挂载 Redis 链路追踪: %w", err)
		}
	}
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
