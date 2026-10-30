// Package obs OpenTelemetry 链路追踪初始化：TracerProvider 装配、OTLP 导出与优雅关闭。
// 设计约定：New 在 Enabled=false 时返回空操作 Provider（各方法均为 no-op），
// 调用方无需在业务代码里判断开关状态——埋点代码可以无条件调用。
package obs

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
	"go.opentelemetry.io/otel/trace"
)

// Config 追踪初始化参数（由 config.Obs 转换而来）
type Config struct {
	Enabled     bool
	Endpoint    string
	Insecure    bool
	SampleRatio float64
	ServiceName string
	Environment string
}

// Provider 持有 TracerProvider 与关闭钩子；Enabled=false 时 tp 为 nil
type Provider struct {
	tp *sdktrace.TracerProvider
}

// New 按配置装配 Provider。启用时：
//   - 创建 OTLP gRPC exporter（连接失败不阻塞启动，exporter 自带重连）
//   - 组装 Resource（service.name 决定 Jaeger 服务列表里的名字）
//   - 配置头部采样器并注册为全局 TracerProvider / Propagator
//
// 禁用时返回空 Provider，不建立任何网络连接。
func New(ctx context.Context, cfg Config) (*Provider, error) {
	if !cfg.Enabled {
		return &Provider{}, nil
	}

	opts := []otlptracegrpc.Option{otlptracegrpc.WithEndpoint(cfg.Endpoint)}
	if cfg.Insecure {
		opts = append(opts, otlptracegrpc.WithInsecure())
	}
	exp, err := otlptracegrpc.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("创建 OTLP exporter: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			// DeploymentEnvironmentName 在该 semconv 版本只有 Key，无同名构造函数
			semconv.DeploymentEnvironmentNameKey.String(cfg.Environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("构造 resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler(cfg.SampleRatio)),
	)
	otel.SetTracerProvider(tp)
	// W3C TraceContext 是跨服务传递 trace_id 的标准头（traceparent），
	// Baggage 用于携带业务上下文；两者组成组合传播器
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return &Provider{tp: tp}, nil
}

// TracerProvider 返回底层 provider（供 GORM/Redis 等插件显式注入）。
// 未启用时返回全局默认（no-op），调用方无需判空。
func (p *Provider) TracerProvider() trace.TracerProvider {
	if p == nil || p.tp == nil {
		return otel.GetTracerProvider()
	}
	return p.tp
}

// Enabled 是否真正启用了导出
func (p *Provider) Enabled() bool {
	return p != nil && p.tp != nil
}

// Shutdown 冲刷缓冲区中的 span 并关闭 exporter。
// 必须在进程退出路径调用——BatchSpanProcessor 是异步批量上报的，
// 不走这一步，最后几秒的 span 会随进程一起丢失。
func (p *Provider) Shutdown(ctx context.Context) error {
	if p == nil || p.tp == nil {
		return nil
	}
	return p.tp.Shutdown(ctx)
}

// sampler 头部采样：ratio >= 1 全采，<= 0 不采，其余按 TraceID 比例采样。
// 外层 ParentBased 保证上游决定不采样时下游跟随，避免链路残缺。
func sampler(ratio float64) sdktrace.Sampler {
	switch {
	case ratio >= 1:
		return sdktrace.ParentBased(sdktrace.AlwaysSample())
	case ratio <= 0:
		return sdktrace.ParentBased(sdktrace.NeverSample())
	default:
		return sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio))
	}
}
