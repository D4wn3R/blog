// 同分类上一篇/下一篇数据层回归（#13）：相邻、边界、id 决胜、隐藏排除、分类约束、置顶。
// 需要隔离 MySQL（BLOG_TEST_DSN），每个用例自建一次性 schema 并在结束时销毁
package repository

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	gormmysql "gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/D4wn3R/blog/backend/internal/model"
	"github.com/D4wn3R/blog/backend/internal/pkg/randx"
)

// newArticleNavTestDB 在 BLOG_TEST_DSN 指向的实例上新建一次性 schema，建出 Category/Article 表
func newArticleNavTestDB(t *testing.T) *Repository {
	t.Helper()
	raw := os.Getenv("BLOG_TEST_DSN")
	if raw == "" {
		t.Skip("未设置 BLOG_TEST_DSN，跳过需要 MySQL 的相邻文章数据层测试")
	}
	cfg, err := mysql.ParseDSN(raw)
	if err != nil {
		t.Fatalf("解析 BLOG_TEST_DSN: %v", err)
	}
	cfg.ParseTime = true
	admin, err := gorm.Open(gormmysql.Open(cfg.FormatDSN()), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接 MySQL: %v", err)
	}
	name := "blog_nav_repo_" + randx.Hex(6)
	if err := admin.Exec("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4").Error; err != nil {
		t.Fatalf("创建临时 schema: %v", err)
	}
	t.Cleanup(func() {
		if err := admin.Exec("DROP DATABASE IF EXISTS `" + name + "`").Error; err != nil {
			t.Logf("清理临时 schema %s: %v", name, err)
		}
	})
	cfg.DBName = name
	db, err := gorm.Open(gormmysql.Open(cfg.FormatDSN()), &gorm.Config{})
	if err != nil {
		t.Fatalf("连接临时 schema: %v", err)
	}
	// Category 先建（外键依赖），many2join article_tags 随 Article 迁移自动建出
	if err := db.AutoMigrate(&model.Category{}, &model.Article{}); err != nil {
		t.Fatalf("建表: %v", err)
	}
	return New(db)
}

type navSeed struct {
	slug        string
	title       string
	categoryID  uint64
	publishedAt time.Time
	status      int8
	pinned      bool
	password    string
}

func seedArticle(t *testing.T, r *Repository, s navSeed) *model.Article {
	t.Helper()
	a := &model.Article{
		Title:        s.title,
		Slug:         s.slug,
		CategoryID:   s.categoryID,
		Status:       s.status,
		Pinned:       s.pinned,
		PasswordHash: s.password,
		PublishedAt:  &s.publishedAt,
	}
	if err := r.DB().Create(a).Error; err != nil {
		t.Fatalf("建文章 %s: %v", s.slug, err)
	}
	return a
}

func mkCat(t *testing.T, r *Repository, name string) uint64 {
	t.Helper()
	c := model.Category{Name: name}
	if err := r.DB().Create(&c).Error; err != nil {
		t.Fatalf("建分类 %s: %v", name, err)
	}
	return c.ID
}

func at(minutesAgo int) time.Time {
	return time.Now().Add(-time.Duration(minutesAgo) * time.Minute).Truncate(time.Second)
}

func mustNav(t *testing.T, r *Repository, a *model.Article) (prev, next *ArticleNav) {
	t.Helper()
	prev, next, err := r.AdjacentArticles(context.Background(), a.CategoryID, a.ID, *a.PublishedAt)
	if err != nil {
		t.Fatalf("AdjacentArticles(%s): %v", a.Slug, err)
	}
	return prev, next
}

func wantSlug(t *testing.T, n *ArticleNav, want string) {
	t.Helper()
	got := ""
	if n != nil {
		got = n.Slug
	}
	if got != want {
		t.Fatalf("导航 slug = %q, 期望 %q", got, want)
	}
}

func TestAdjacentArticlesTimeOrder(t *testing.T) {
	r := newArticleNavTestDB(t)
	cat := mkCat(t, r, "golang")
	first := seedArticle(t, r, navSeed{slug: "a-first", title: "第一篇", categoryID: cat, publishedAt: at(300)})
	mid := seedArticle(t, r, navSeed{slug: "b-mid", title: "第二篇", categoryID: cat, publishedAt: at(200)})
	last := seedArticle(t, r, navSeed{slug: "c-last", title: "第三篇", categoryID: cat, publishedAt: at(100)})

	prev, next := mustNav(t, r, mid)
	wantSlug(t, prev, "a-first")
	wantSlug(t, next, "c-last")

	prev, next = mustNav(t, r, first)
	wantSlug(t, prev, "") // 分类最早一篇：prev 边界
	wantSlug(t, next, "b-mid")

	prev, next = mustNav(t, r, last)
	wantSlug(t, prev, "b-mid")
	wantSlug(t, next, "") // 分类最晚一篇：next 边界
}

func TestAdjacentArticlesSingleArticleNullBoth(t *testing.T) {
	r := newArticleNavTestDB(t)
	cat := mkCat(t, r, "solo")
	only := seedArticle(t, r, navSeed{slug: "only-one", title: "唯一一篇", categoryID: cat, publishedAt: at(60)})

	prev, next := mustNav(t, r, only)
	wantSlug(t, prev, "")
	wantSlug(t, next, "")
}

func TestAdjacentArticlesSameTimeTieBreak(t *testing.T) {
	r := newArticleNavTestDB(t)
	cat := mkCat(t, r, "tie")
	same := at(120)
	// 同一时刻三篇：id 1/2/3，nav 次序按 id 决胜
	seedArticle(t, r, navSeed{slug: "tie-1", title: "同刻一", categoryID: cat, publishedAt: same})
	mid := seedArticle(t, r, navSeed{slug: "tie-2", title: "同刻二", categoryID: cat, publishedAt: same})
	seedArticle(t, r, navSeed{slug: "tie-3", title: "同刻三", categoryID: cat, publishedAt: same})

	prev, next := mustNav(t, r, mid)
	wantSlug(t, prev, "tie-1") // 同刻 id 更小里最大的一条
	wantSlug(t, next, "tie-3") // 同刻 id 更大里最小的一条

	// 首篇（id 最小）：同刻无更小 id，next 也应取同刻 id 更大的最小一条
	r2 := newArticleNavTestDB(t)
	cat2 := mkCat(t, r2, "tie2")
	same2 := at(90)
	head := seedArticle(t, r2, navSeed{slug: "h-1", title: "头篇", categoryID: cat2, publishedAt: same2})
	seedArticle(t, r2, navSeed{slug: "h-2", title: "次篇", categoryID: cat2, publishedAt: same2})
	prev, next = mustNav(t, r2, head)
	wantSlug(t, prev, "")
	wantSlug(t, next, "h-2")
}

func TestAdjacentArticlesExcludesHidden(t *testing.T) {
	r := newArticleNavTestDB(t)
	cat := mkCat(t, r, "hidden")
	seedArticle(t, r, navSeed{slug: "hide-first", title: "第一篇", categoryID: cat, publishedAt: at(300)})
	seedArticle(t, r, navSeed{slug: "hide-mid", title: "隐藏篇", categoryID: cat, publishedAt: at(200), status: model.ArticleStatusHidden})
	last := seedArticle(t, r, navSeed{slug: "hide-last", title: "第三篇", categoryID: cat, publishedAt: at(100)})

	prev, next := mustNav(t, r, last)
	wantSlug(t, prev, "hide-first") // 隐藏文章不作为 prev
	wantSlug(t, next, "")
}

func TestAdjacentArticlesCategoryScope(t *testing.T) {
	r := newArticleNavTestDB(t)
	catA := mkCat(t, r, "cat-a")
	catB := mkCat(t, r, "cat-b")
	only := seedArticle(t, r, navSeed{slug: "scope-a", title: "A 分类唯一", categoryID: catA, publishedAt: at(120)})
	seedArticle(t, r, navSeed{slug: "scope-b", title: "B 分类文章", categoryID: catB, publishedAt: at(60)})
	seedArticle(t, r, navSeed{slug: "scope-b2", title: "B 分类更早", categoryID: catB, publishedAt: at(300)})

	prev, next := mustNav(t, r, only)
	wantSlug(t, prev, "") // 跨分类不返回
	wantSlug(t, next, "")
}

func TestAdjacentArticlesPinnedIgnored(t *testing.T) {
	r := newArticleNavTestDB(t)
	cat := mkCat(t, r, "pinned")
	early := seedArticle(t, r, navSeed{slug: "pin-early", title: "早篇", categoryID: cat, publishedAt: at(300)})
	// 置顶但发布时间最晚：不影响 nav 排序，纯按 published_at
	seedArticle(t, r, navSeed{slug: "pin-late", title: "晚篇置顶", categoryID: cat, publishedAt: at(100), pinned: true})

	prev, next := mustNav(t, r, early)
	wantSlug(t, prev, "")
	wantSlug(t, next, "pin-late")
}

func TestAdjacentArticlesEncryptedIncluded(t *testing.T) {
	r := newArticleNavTestDB(t)
	cat := mkCat(t, r, "enc")
	plain := seedArticle(t, r, navSeed{slug: "enc-plain", title: "明文", categoryID: cat, publishedAt: at(200)})
	seedArticle(t, r, navSeed{slug: "enc-locked", title: "加密篇", categoryID: cat, publishedAt: at(100), password: "$2a$10$hash"})

	prev, next := mustNav(t, r, plain)
	wantSlug(t, prev, "")
	wantSlug(t, next, "enc-locked") // 加密文章不排除
}
