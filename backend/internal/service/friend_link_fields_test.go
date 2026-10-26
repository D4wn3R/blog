package service

// FriendLinkService.fields 头像校验单测：头像为友邻站点外链（http(s)://），
// 与本站对象存储相对路径无关；空值合法

import "testing"

func TestFriendLinkFieldsImage(t *testing.T) {
	svc := &FriendLinkService{}
	cases := []struct {
		name  string
		image string
		fail  bool
	}{
		{name: "空值合法", image: ""},
		{name: "空白串视为空", image: "   "},
		{name: "https 外链合法", image: "https://www.0n1y.org/0n1y.jpg"},
		{name: "http 外链合法", image: "http://cdn.example.com/a.png"},
		{name: "相对路径不合法", image: "/files/a.webp", fail: true},
		{name: "裸域名不合法", image: "www.example.com/a.png", fail: true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := svc.fields("站点", "https://example.com/", "简介", c.image)
			if c.fail && err == nil {
				t.Fatalf("image=%q 应校验失败", c.image)
			}
			if !c.fail && err != nil {
				t.Fatalf("image=%q 应通过校验，实得 %v", c.image, err)
			}
		})
	}
}
