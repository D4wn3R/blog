package repository

import (
	"slices"
	"testing"
)

// addViewsStatement 批量自增语句：id 排序保证 SQL 与参数顺序稳定

func TestAddViewsStatement(t *testing.T) {
	tests := []struct {
		name      string
		give      map[uint64]uint64
		wantQuery string
		wantArgs  []any
	}{
		{name: "空 map", give: map[uint64]uint64{}, wantQuery: "", wantArgs: nil},
		{
			name:      "单篇",
			give:      map[uint64]uint64{9: 3},
			wantQuery: "UPDATE `articles` SET `views` = `views` + (CASE `id` WHEN ? THEN ? ELSE 0 END) WHERE `id` IN (?)",
			wantArgs:  []any{uint64(9), uint64(3), uint64(9)},
		},
		{
			name: "多篇按 id 升序",
			give: map[uint64]uint64{12: 1, 9: 3},
			wantQuery: "UPDATE `articles` SET `views` = `views` + (CASE `id` WHEN ? THEN ? WHEN ? THEN ? " +
				"ELSE 0 END) WHERE `id` IN (?,?)",
			wantArgs: []any{uint64(9), uint64(3), uint64(12), uint64(1), uint64(9), uint64(12)},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotQuery, gotArgs := addViewsStatement(tt.give)
			if gotQuery != tt.wantQuery {
				t.Errorf("语句 = %q， want %q", gotQuery, tt.wantQuery)
			}
			if !slices.Equal(gotArgs, tt.wantArgs) {
				t.Errorf("参数 = %v， want %v", gotArgs, tt.wantArgs)
			}
		})
	}
}
