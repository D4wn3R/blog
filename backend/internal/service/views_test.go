package service

import (
	"maps"
	"testing"
)

// parseViewsPairs 解析 Lua HGETALL 平铺数组：重复 id 累加，脏项跳过

func TestParseViewsPairs(t *testing.T) {
	tests := []struct {
		name string
		give any
		want map[uint64]uint64
	}{
		{name: "空哈希", give: []any{}, want: map[uint64]uint64{}},
		{name: "单条", give: []any{"9", "3"}, want: map[uint64]uint64{9: 3}},
		{name: "重复 id 累加", give: []any{"9", "3", "9", "2"}, want: map[uint64]uint64{9: 5}},
		{name: "奇数尾巴忽略", give: []any{"9", "3", "7"}, want: map[uint64]uint64{9: 3}},
		{name: "非数字项跳过", give: []any{"x", "3", "9", "abc"}, want: map[uint64]uint64{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseViewsPairs(tt.give)
			if err != nil {
				t.Fatalf("parseViewsPairs(%v) 意外失败: %v", tt.give, err)
			}
			if !maps.Equal(got, tt.want) {
				t.Errorf("parseViewsPairs(%v) = %v， want %v", tt.give, got, tt.want)
			}
		})
	}
}

func TestParseViewsPairs_RejectsNonSlice(t *testing.T) {
	if _, err := parseViewsPairs("not-a-slice"); err == nil {
		t.Fatal("非数组返回值应报错")
	}
}
