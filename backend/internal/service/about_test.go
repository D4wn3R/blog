package service

// parseJourneyTime 表驱动单测：YYYY-M-D 不补零为主契约，补零（date 控件输出）须兼容

import (
	"testing"
	"time"
)

func TestParseJourneyTime(t *testing.T) {
	cases := []struct {
		in   string
		want time.Time
		fail bool
	}{
		{in: "2026-4-16", want: time.Date(2026, 4, 16, 0, 0, 0, 0, _shanghaiZone)},
		{in: "2026-04-16", want: time.Date(2026, 4, 16, 0, 0, 0, 0, _shanghaiZone)}, // date 控件补零输出
		{in: " 2026-12-1 ", want: time.Date(2026, 12, 1, 0, 0, 0, 0, _shanghaiZone)},
		{in: "", fail: true},
		{in: "2026-13-1", fail: true}, // 月越界
		{in: "2026-2-30", fail: true}, // 日越界
		{in: "2026-4", fail: true},    // 缺日
		{in: "2023-2025", fail: true}, // 旧自由文本
		{in: "在读期间", fail: true},      // 旧自由文本
	}
	for _, c := range cases {
		got, err := parseJourneyTime(c.in)
		if c.fail {
			if err == nil {
				t.Errorf("parseJourneyTime(%q) 应失败，实得 %v", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseJourneyTime(%q) 意外失败: %v", c.in, err)
			continue
		}
		if !got.Equal(c.want) {
			t.Errorf("parseJourneyTime(%q) = %v， want %v", c.in, got, c.want)
		}
	}
}
