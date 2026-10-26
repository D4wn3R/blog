// Package service 业务逻辑层：按模块拆分子服务，事务边界在本层与 repository
package service

import (
	"context"
	"encoding/xml"
	"strings"
	"time"

	"github.com/man-mu/blog/backend/internal/repository"
)

// RSS 订阅源（GET /feed.xml，RSS 2.0）
// 数据源：site_settings 站点文案 + 已发布文章最新 _feedMaxItems 篇（含 content_md，2 条 SQL）；
// content:encoded 输出轻量 MD→HTML 全文（escape 后重建标签，无 raw HTML 通道，XSS 面为零），
// 与"后端零 markdown 依赖/零渲染基线"不冲突——C 端正文渲染仍在前端。

// FeedService RSS 订阅源子服务（/feed.xml，RSS 2.0）
type FeedService struct {
	svc *Service
}

// _feedMaxItems feed 输出条数上限（订阅语义只关心最近更新）
const _feedMaxItems = 20

type rssFeed struct {
	XMLName xml.Name `xml:"rss"`
	Version string   `xml:"version,attr"`
	// Content namespace（RSS 全文扩展 content:encoded 的规范声明）
	XmlnsContent string     `xml:"xmlns:content,attr"`
	Channel      rssChannel `xml:"channel"`
}

type rssChannel struct {
	Title       string    `xml:"title"`
	Link        string    `xml:"link"`
	Description string    `xml:"description"`
	Language    string    `xml:"language"`
	Items       []rssItem `xml:"item"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	PubDate     string `xml:"pubDate,omitempty"`
	Description string `xml:"description,omitempty"`
	// ContentEncoded RSS 全文扩展（content namespace 在 rssFeed 根 attr 声明）；
	// type=html 传输渲染后正文（封面/正文图/代码块），阅读器内直接可读。
	// 正文经 encoding/xml 自动实体转义（< → &lt; 等）——XML 合法且阅读器等同解析，
	// 不用 CDATA（encoding/xml 不支持，手写 token 会被二次转义）
	ContentEncoded feedCDATA `xml:"encoded"`
}

// feedCDATA content:encoded 文本节点：chardata 由 encoding/xml 自动实体转义；
// 空（加密文章/无封面且无正文的防御态）不输出元素
type feedCDATA struct {
	Text string `xml:",chardata"`
}

func (c feedCDATA) MarshalXML(e *xml.Encoder, start xml.StartElement) error {
	if c.Text == "" {
		return nil
	}
	start.Name = xml.Name{Space: "http://purl.org/rss/1.0/modules/content/", Local: "encoded"}
	start.Attr = []xml.Attr{{Name: xml.Name{Local: "type"}, Value: "html"}}
	return e.EncodeElement(c.Text, start)
}

// Generate 查询站点设置与最新文章并渲染 feed XML（实时生成，文章量级下开销可忽略）
func (s *FeedService) Generate(ctx context.Context) ([]byte, error) {
	settingRows, err := s.svc.Repo.ListSiteSettings(ctx)
	if err != nil {
		return nil, errServer(err)
	}
	values := make(map[string]string, len(settingRows))
	for _, row := range settingRows {
		values[row.Key] = row.Value
	}
	articles, err := s.svc.Repo.ListArticlesForFeed(ctx, _feedMaxItems)
	if err != nil {
		return nil, errServer(err)
	}
	return buildFeed(
		strings.TrimSpace(values["site_title"]),
		strings.TrimSpace(values["site_name"]),
		strings.TrimSpace(values["site_url"]),
		values["hero_tagline"],
		articles,
	), nil
}

// buildFeed 纯渲染函数（单测覆盖）：
//   - channel 标题沿用标签页语义：site_title 覆盖项，未配置回退 site_name
//   - 文章链接用 site_url 拼绝对路径（RSS 链接必须是绝对 URL）
//   - pubDate 用 RFC1123Z（RSS 规范引用 RFC822，但其时区缩写名在阅读器间易歧义，
//     数字偏移的 RFC1123Z 全主流阅读器兼容）；时间统一归一 +08:00 契约时区
//   - description 输出纯文本摘要（原 value；标签页文案）；content:encoded 输出 HTML 全文
//   - 加密文章 summary 为空（D-summary 写入口径），content 亦不输出——防加密正文泄露
func buildFeed(siteTitle, siteName, siteURL, tagline string, articles []repository.FeedArticleRow) []byte {
	base := strings.TrimRight(siteURL, "/")
	title := siteTitle
	if title == "" {
		title = siteName
	}
	items := make([]rssItem, 0, len(articles))
	for _, a := range articles {
		link := base + "/posts/" + a.Slug
		item := rssItem{
			Title:       a.Title,
			Link:        link,
			GUID:        link,
			Description: a.Summary,
			// 封面图放正文最前，阅读器可见主图；加密文章（content_md 为空）不输出 content
			ContentEncoded: feedCDATA{Text: feedArticleHTML(base, a)},
		}
		if a.PublishedAt != nil {
			item.PubDate = a.PublishedAt.In(_shanghaiZone).Format(time.RFC1123Z)
		}
		items = append(items, item)
	}
	feed := rssFeed{
		Version:      "2.0",
		XmlnsContent: "http://purl.org/rss/1.0/modules/content/",
		Channel: rssChannel{
			Title:       title,
			Link:        base,
			Description: strings.ReplaceAll(tagline, "\n", " "),
			Language:    "zh-CN",
			Items:       items,
		},
	}
	out, err := xml.Marshal(feed)
	if err != nil {
		return []byte(xml.Header) // 结构体 marshal 不可能失败，防御兜底
	}
	return append([]byte(xml.Header), out...)
}
