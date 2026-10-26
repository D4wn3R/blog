package service

// feed 轻量 MD→HTML：只覆盖博客常用语法子集（标题/段落/代码块/行内代码/列表/引用/
// 图片/链接/粗斜体），全部先 html.EscapeString 再拼标签——无 raw HTML 通道，无 XSS 面。
// C 端阅读体验由前端 markdown-it 承担，此处以阅读器可读为标准，刻意不求等价渲染

import (
	"fmt"
	"html"
	"regexp"
	"strings"

	"github.com/man-mu/blog/backend/internal/repository"
)

// 行内语法正则（输入已 html 转义，属性值内的引号已成 &quot;，子匹配不会越界破坏标签）
var (
	// ![alt](src)：src 不得以引号或右括号开头（转义后 &quot; 开头即用户写引号）
	_imageRe = regexp.MustCompile(`!\[([^\]]*)\]\(([^)&"][^)]*)\)`)
	// [text](href)：href 同上约束
	_linkRe   = regexp.MustCompile(`\[([^\]]+)\]\(([^)&"][^)]*)\)`)
	_boldRe   = regexp.MustCompile(`\*\*([^*\n]+)\*\*`)
	_italicRe = regexp.MustCompile(`\*([^*\n]+)\*`)
)

// feedArticleHTML 单篇文章的 content:encoded 正文：
// 封面图（若有）置顶，其后为渲染后的 markdown 全文；加密文章返回空串（不泄露正文）
func feedArticleHTML(base string, a repository.FeedArticleRow) string {
	if a.ContentMD == "" {
		return ""
	}
	var b strings.Builder
	if a.CoverURL != "" {
		fmt.Fprintf(&b, `<p><img src="%s%s" alt="%s" /></p>`, html.EscapeString(base), html.EscapeString(a.CoverURL), html.EscapeString(a.Title))
	}
	b.WriteString(feedMDToHTML(a.ContentMD))
	return b.String()
}

// feedMDToHTML 逐块转换：围栏代码块与段落为块级单元，行首标记识别嵌套列表/引用，
// 行内转换（转义→代码→图→链接→粗斜体）在段内进行
func feedMDToHTML(src string) string {
	var b strings.Builder
	paragraph := func(lines []string) {
		if len(lines) == 0 {
			return
		}
		text := feedInline(strings.Join(lines, "<br />"))
		if text != "" {
			fmt.Fprintf(&b, "<p>%s</p>", text)
		}
	}
	var buf []string
	flush := func() {
		paragraph(buf)
		buf = buf[:0]
	}
	lines := strings.Split(src, "\n")
	for i := 0; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], " \t\r")
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "```"):
			flush()
			lang := strings.TrimPrefix(trimmed, "```")
			var code []string
			for i++; i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i]), "```"); i++ {
				code = append(code, lines[i])
			}
			fmt.Fprintf(&b, "<pre><code data-lang=%q>%s</code></pre>", html.EscapeString(lang), html.EscapeString(strings.Join(code, "\n")))
		case trimmed == "":
			flush()
		case headingLevel(trimmed) > 0:
			flush()
			lvl := headingLevel(trimmed)
			fmt.Fprintf(&b, "<h%d>%s</h%d>", lvl, feedInline(strings.TrimLeft(trimmed, "# ")), lvl)
		case strings.HasPrefix(trimmed, ">"):
			flush()
			fmt.Fprintf(&b, "<blockquote>%s</blockquote>", feedInline(strings.TrimSpace(strings.TrimPrefix(trimmed, ">"))))
		case isListItem(trimmed):
			flush()
			// 连续列表行合并为一个 ul/ol（嵌套缩进展平为内层项）
			tag := "ul"
			if leadingNum(trimmed) {
				tag = "ol"
			}
			fmt.Fprintf(&b, "<%s>", tag)
			for ; i < len(lines); i++ {
				item := strings.TrimSpace(lines[i])
				if !isListItem(item) {
					i--
					break
				}
				item = strings.TrimPrefix(item, "- ")
				item = strings.TrimPrefix(item, "* ")
				item = strings.TrimPrefix(item, "+ ")
				if leadingNum(item) {
					item = item[strings.IndexAny(item, ".)")+1:]
				}
				item = strings.TrimSpace(strings.TrimPrefix(item, "  ")) // 二级缩进
				fmt.Fprintf(&b, "<li>%s</li>", feedInline(item))
			}
			fmt.Fprintf(&b, "</%s>", tag)
		default:
			buf = append(buf, line)
		}
	}
	flush()
	return b.String()
}

// headingLevel "# 标题" → 1..6，非标题 0
func headingLevel(s string) int {
	if !strings.HasPrefix(s, "#") {
		return 0
	}
	n := 0
	for n < len(s) && s[n] == '#' {
		n++
	}
	if n <= 6 && n < len(s) && s[n] == ' ' {
		return n
	}
	return 0
}

func isListItem(s string) bool {
	return strings.HasPrefix(s, "- ") || strings.HasPrefix(s, "* ") || strings.HasPrefix(s, "+ ") || leadingNum(s)
}

// leadingNum 有序列表行首（"1." / "12)"）
func leadingNum(s string) bool {
	i := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	return i > 0 && i < len(s) && (s[i] == '.' || s[i] == ')') && i+1 < len(s) && s[i+1] == ' '
}

// feedInline 行内转换：先整体转义抹掉 raw HTML，再按码段→图片→链接→粗体→斜体重建标记；
// 图片/链接的相对路径保持原样（feed 由阅读器按文章页 base 解析，与站内相对路径约定一致）
func feedInline(s string) string {
	out := html.EscapeString(s)
	// 行内代码（转义后反引号不受影响）；段内不跨 `
	for {
		i := strings.Index(out, "`")
		if i < 0 {
			break
		}
		j := strings.Index(out[i+1:], "`")
		if j < 0 {
			break
		}
		out = out[:i] + `<code>` + out[i+1:i+1+j] + `</code>` + out[i+j+2:]
	}
	out = _imageRe.ReplaceAllStringFunc(out, func(m string) string {
		sub := _imageRe.FindStringSubmatch(m)
		return fmt.Sprintf(`<img src="%s" alt="%s" />`, sub[2], sub[1])
	})
	out = _linkRe.ReplaceAllStringFunc(out, func(m string) string {
		sub := _linkRe.FindStringSubmatch(m)
		return fmt.Sprintf(`<a href="%s">%s</a>`, sub[2], sub[1])
	})
	out = _boldRe.ReplaceAllString(out, "<strong>$1</strong>")
	out = _italicRe.ReplaceAllString(out, "<em>$1</em>")
	return out
}
