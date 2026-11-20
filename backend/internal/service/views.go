package service

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/D4wn3R/blog/backend/internal/pkg/logctx"
)

// 浏览量异步计数：详情页每次浏览只做一次 Redis HINCRBY，后台周期性批量刷回 MySQL。
// 动机：views 自增原是独立事务，MySQL 双写落盘（redo + binlog）在慢盘上让一次浏览
// 付出 100–250ms；浏览量不是强一致数据，无需占住读路径。
const (
	// _viewsPendingKey 未落库浏览量的 Redis 哈希；Redis 重启会丢失未冲刷增量
	// （浏览量非关键数据，不做持久化；MySQL 已落库的值不受影响）
	_viewsPendingKey    = "article:views:pending"
	_viewsFlushInterval = 30 * time.Second
	// _viewsFlushTimeout 单次冲刷上限：只兜底 MySQL 卡死，避免 Stop 被无限期拖住
	_viewsFlushTimeout = 10 * time.Second
)

// _drainViewsScript 原子取出 pending 哈希并清空：HGETALL 与 DEL 之间没有窗口，
// 避免「已读出但未删除」期间的新增量被下一轮覆盖
const _drainViewsScript = `
local pairs = redis.call('HGETALL', KEYS[1])
if #pairs > 0 then
	redis.call('DEL', KEYS[1])
end
return pairs
`

// IncrArticleViews 记录一次浏览，返回该文章尚未落库的累计增量。
// Redis 不可用时只记日志并返回 1：浏览量非关键数据，不能让详情页读路径失败。
func (s *ArticleService) IncrArticleViews(ctx context.Context, id uint64) int64 {
	delta, err := s.svc.Redis.HIncrBy(ctx, _viewsPendingKey, strconv.FormatUint(id, 10), 1).Result()
	if err != nil {
		logctx.From(ctx).Warn("incr article views", "article_id", id, "err", err)
		return 1
	}
	return delta
}

// ViewsFlusher 浏览量后台冲刷器：StartViewsFlusher 创建，Stop 停止循环、
// 等待 goroutine 退出，并在退出前做最后一次冲刷（须在 Redis/MySQL 关闭之前调用）
type ViewsFlusher struct {
	svc  *Service
	stop chan struct{}
	done chan struct{}
	once sync.Once
}

// StartViewsFlusher 启动周期性冲刷（interval <= 0 时用默认 30s）
func (s *Service) StartViewsFlusher(interval time.Duration) *ViewsFlusher {
	if interval <= 0 {
		interval = _viewsFlushInterval
	}
	f := &ViewsFlusher{
		svc:  s,
		stop: make(chan struct{}),
		done: make(chan struct{}),
	}
	go f.loop(interval)
	return f
}

func (f *ViewsFlusher) loop(interval time.Duration) {
	defer close(f.done)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			f.flush()
		case <-f.stop:
			return
		}
	}
}

// Stop 幂等：停止循环、等待退出，再执行最后一次冲刷
func (f *ViewsFlusher) Stop() {
	f.once.Do(func() { close(f.stop) })
	<-f.done
	f.flush()
}

// flush 取走 pending 增量并批量落库；DB 失败时回填，下一轮重试。
// 回填也失败说明 Redis 已不可用，只能放弃这一批（浏览量非关键数据）
func (f *ViewsFlusher) flush() {
	ctx, cancel := context.WithTimeout(context.Background(), _viewsFlushTimeout)
	defer cancel()

	deltas, err := f.drain(ctx)
	if err != nil {
		logctx.From(ctx).Warn("drain article views", "err", err)
		return
	}
	if len(deltas) == 0 {
		return
	}
	if err := f.svc.Repo.AddArticleViews(ctx, deltas); err != nil {
		logctx.From(ctx).Warn("flush article views", "articles", len(deltas), "err", err)
		f.requeue(ctx, deltas)
	}
}

// drain 执行取出脚本并解析 [field, value, ...] 平铺数组
func (f *ViewsFlusher) drain(ctx context.Context) (map[uint64]uint64, error) {
	raw, err := f.svc.Redis.Eval(ctx, _drainViewsScript, []string{_viewsPendingKey}).Result()
	if err != nil {
		return nil, err
	}
	deltas, err := parseViewsPairs(raw)
	if err != nil {
		return nil, err
	}
	return deltas, nil
}

// requeue 把未落库的增量写回 pending，交由下一轮重试
func (f *ViewsFlusher) requeue(ctx context.Context, deltas map[uint64]uint64) {
	for id, delta := range deltas {
		if err := f.svc.Redis.HIncrBy(ctx, _viewsPendingKey, strconv.FormatUint(id, 10), int64(delta)).Err(); err != nil {
			logctx.From(ctx).Warn("requeue article views", "article_id", id, "err", err)
		}
	}
}

// parseViewsPairs 把 Lua HGETALL 的平铺数组解析成 id → 增量。
// 非法项跳过而非整体失败：计数不值得为一条脏数据丢掉整批
func parseViewsPairs(raw any) (map[uint64]uint64, error) {
	if raw == nil {
		return map[uint64]uint64{}, nil
	}
	pairs, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("views drain: 意外的返回值类型 %T", raw)
	}
	deltas := make(map[uint64]uint64, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		idRaw, okID := pairs[i].(string)
		deltaRaw, okDelta := pairs[i+1].(string)
		if !okID || !okDelta {
			continue
		}
		id, errID := strconv.ParseUint(idRaw, 10, 64)
		delta, errDelta := strconv.ParseUint(deltaRaw, 10, 64)
		if errID != nil || errDelta != nil {
			continue
		}
		deltas[id] += delta
	}
	return deltas, nil
}
