package service

// buildFeed 纯函数单测（无 DB 依赖）：标题回退/绝对链接/时间格式/XML 转义/换行展平/
// content:encoded 全文（封面置顶、正文 HTML、加密文章不输出）

import (
	"strings"
	"testing"
	"time"

	"github.com/man-mu/blog/backend/internal/repository"
)

func TestBuildFeed(t *testing.T) {
	// UTC 2026-09-12 10:00 → +08:00 契约时区 18:00（2026-09-12 为星期六）
	at := time.Date(2026, 9, 12, 10, 0, 0, 0, time.UTC)
	got := string(buildFeed("", "空中花园", "https://blog.example.com/", "宠辱不惊，闲看庭前花开花落\n去留无意，漫随天外云舒云卷", []repository.FeedArticleRow{
		{Slug: "hello-world", Title: "标题 A&B <x>", Summary: "摘要一", CoverURL: "/files/cover.webp", ContentMD: "# 第一节\n\n正文**加粗**与![图](/files/a.webp)", PublishedAt: &at},
		{Slug: "secret", Title: "加密文章", Summary: ""}, // 加密：无摘要、content_md 为空
		{Slug: "draft-like", Title: "无发布时间", Summary: "摘要三"},
	}))

	checks := map[string]string{
		"xml 头":         `<?xml version="1.0" encoding="UTF-8"?>`,
		"rss 版本":        `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">`,
		"标题回退":          "<title>空中花园</title>",
		"channel 链接":    "<link>https://blog.example.com</link>",
		"简介换行展平":        "<description>宠辱不惊，闲看庭前花开花落 去留无意，漫随天外云舒云卷</description>",
		"item 绝对链接":     "<link>https://blog.example.com/posts/hello-world</link>",
		"guid 与链接同值":    "<guid>https://blog.example.com/posts/hello-world</guid>",
		"标题 XML 转义":     "标题 A&amp;B &lt;x&gt;</title>",
		"摘要输出":          "<description>摘要一</description>",
		"pubDate +0800": "Sat, 12 Sep 2026 18:00:00 +0800",
		"语言":            "<language>zh-CN</language>",
		"全文容器":          `<encoded xmlns="http://purl.org/rss/1.0/modules/content/" type="html"`,
		"全文封面图":         `&lt;img src=&#34;https://blog.example.com/files/cover.webp&#34;`,
		"全文标题 HTML":     "&lt;h1&gt;第一节&lt;/h1&gt;",
		"全文粗体":          "&lt;strong&gt;加粗&lt;/strong&gt;",
		"全文图片":          "&lt;img src=&#34;/files/a.webp&#34;",
	}
	for name, want := range checks {
		if !strings.Contains(got, want) {
			t.Errorf("%s 缺失: 未找到 %q\nfeed 输出:\n%s", name, want, got)
		}
	}
	// 无发布时间的条目不输出 pubDate 元素
	if strings.Contains(got, "draft-like") && strings.Contains(got, "<pubDate></pubDate>") {
		t.Errorf("无发布时间不应输出空 pubDate 元素:\n%s", got)
	}
	// 加密文章（content_md 空）不输出 content:encoded 元素
	if strings.Contains(got, "加密文章</title>") && strings.Contains(strings.Split(got, "加密文章</title>")[1], "content:encoded") {
		t.Errorf("加密文章不应输出 content:encoded:\n%s", got)
	}
}

func TestBuildFeedSiteTitleOverride(t *testing.T) {
	got := string(buildFeed("覆盖标题", "站点名", "https://a.example.com/", "", nil))
	if !strings.Contains(got, "<title>覆盖标题</title>") {
		t.Errorf("site_title 覆盖项未生效:\n%s", got)
	}
	if strings.Contains(got, "<title>站点名</title>") {
		t.Errorf("site_title 存在时不应回退 site_name:\n%s", got)
	}

	got = string(buildFeed("", "站点名", "https://a.example.com/", "", nil))
	if !strings.Contains(got, "<title>站点名</title>") {
		t.Errorf("site_title 为空应回退 site_name:\n%s", got)
	}
}

func TestFeedMDToHTML(t *testing.T) {
	src := "# 标题一\n\n段落一，**粗体**与`code`及[链接](https://e.com/a&b)。\n\n```go\nfmt.Println(<x>)\n```\n\n- 列表甲\n- 列表乙\n\n> 引用行\n\n<script>alert(1)</script>\n"
	got := feedMDToHTML(src)
	checks := map[string]string{
		"标题":         "<h1>标题一</h1>",
		"粗体":         "<strong>粗体</strong>",
		"行内代码":       "<code>code</code>",
		"链接属性转义":     `href="https://e.com/a&amp;b"`,
		"代码块整体转义":    "fmt.Println(&lt;x&gt;)",
		"代码块容器":      "<pre><code",
		"列表":         "<ul><li>列表甲</li><li>列表乙</li></ul>",
		"引用":         "<blockquote>引用行</blockquote>",
		"裸 HTML 被转义": "&lt;script&gt;alert(1)&lt;/script&gt;",
	}
	for name, want := range checks {
		if !strings.Contains(got, want) {
			t.Errorf("%s 缺失: 未找到 %q\n输出:\n%s", name, want, got)
		}
	}
	if strings.Contains(got, "<script>") {
		t.Errorf("裸 HTML 必须转义:\n%s", got)
	}
}

func TestSummarySource(t *testing.T) {
	// # 标题/列表/空行被剔除，取实际叙述文本；行内标记保留
	md := "# 大标题\n\n## 小节\n\n- 列表项\n\n**ACID**：原子性是事务的基础。\n\n正文第二段。"
	got := summarySource(md)
	if !strings.HasPrefix(got, "**ACID**") {
		t.Errorf("摘要应从首个叙述行开始: %q", got)
	}
	if strings.Contains(got, "#") || strings.Contains(got, "列表项") {
		t.Errorf("标记行/列表不应进摘要: %q", got)
	}
}
