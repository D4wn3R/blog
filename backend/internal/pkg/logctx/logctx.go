// Package logctx 在 request context 上携带请求级 slog.Logger。
// middleware（RequestID）把带 request_id 字段的 logger 写入 context，
// handler/service 通过 From 取回使用，使日志自动贯穿 request_id；
// context 上无 logger 时回退 slog.Default()，启动期调用方无需特判
package logctx

import (
	"context"
	"log/slog"
)

type ctxKey struct{}

// New 返回携带请求级 logger 的 context
func New(ctx context.Context, l *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, l)
}

// From 取 context 上的请求级 logger，无则回退默认 logger
func From(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok && l != nil {
		return l
	}
	return slog.Default()
}
