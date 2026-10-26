package logctx

import (
	"context"
	"io"
	"log/slog"
	"testing"
)

func TestFrom(t *testing.T) {
	// context 上无 logger：回退默认 logger（非 nil，启动期无需特判）
	if From(context.Background()) == nil {
		t.Fatal("无 logger 应回退 slog.Default()，不得返回 nil")
	}

	// context 上有 logger：原样取回
	l := slog.New(slog.NewTextHandler(io.Discard, nil))
	if got := From(New(context.Background(), l)); got != l {
		t.Fatal("应取回写入的请求级 logger")
	}
}
