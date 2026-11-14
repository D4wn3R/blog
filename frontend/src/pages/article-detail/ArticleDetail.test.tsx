import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ArticleDetail } from './ArticleDetail'
import type { ArticleDetail as ArticleDetailType } from '../../types/api'

// 详情页导航位置（#13）：上一篇在 $ cd ~/posts 返回链接之后、文章标题之前；
// 下一篇在正文 article 之后、评论区之前的 <hr> 上方；边界两侧按钮仍渲染。
// 查询层全部 mock，只验证 DOM 结构与导航渲染，评论/解锁交互由各自用例覆盖
const mocks = vi.hoisted(() => ({
  article: null as ArticleDetailType | null,
}))

vi.mock('../../lib/queries', () => ({
  useArticle: vi.fn(() => ({
    data: mocks.article,
    isPending: false,
    isError: false,
  })),
  useUnlockArticle: vi.fn(() => ({
    isPending: false,
    isError: false,
    error: null,
    mutate: vi.fn(),
  })),
}))

vi.mock('../../lib/authStore', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) => selector({ user: null }),
}))

vi.mock('./CommentSection', () => ({
  CommentSection: () => <section data-testid="comments">comments</section>,
}))

const article: ArticleDetailType = {
  id: 1,
  slug: 'current-post',
  title: '当前文章',
  summary: '',
  cover_url: '',
  has_password: false,
  // 无标题行：toc 为空不渲染 TocSidebar，本文件只关注导航结构
  content_md: '正文段落',
  unlocked: true,
  pinned: false,
  minutes: 1,
  published_at: '2026-11-01T10:00:00+08:00',
  views: 0,
  category: { id: 1, name: 'golang' },
  tags: [],
  prev: { slug: 'prev-post', title: '上一篇目标', published_at: null },
  next: { slug: 'next-post', title: '下一篇目标', published_at: null },
}

const boundaryArticle: ArticleDetailType = {
  ...article,
  prev: null,
  next: null,
}

beforeEach(() => {
  mocks.article = article
})

function renderDetail() {
  return render(
    <MemoryRouter>
      <ArticleDetail />
    </MemoryRouter>,
  )
}

/** A 是否在 DOM 顺序上位于 B 之前 */
function before(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

// jsdom 未实现 matchMedia（TocSidebar/useTocScroll 效应会触到），给个恒不匹配的替身
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
}))

describe('ArticleDetail 相邻导航位置', () => {
  it('上一篇位于 $ cd ~/posts 返回链接之后、文章标题之前', () => {
    const { container } = renderDetail()
    const backLink = container.querySelector('a[href="/posts"]') as HTMLAnchorElement
    const h1 = container.querySelector('h1') as HTMLHeadingElement
    const prevLink = container.querySelector('a[href="/posts/prev-post"]') as HTMLAnchorElement
    expect(backLink).toBeTruthy()
    expect(h1).toBeTruthy()
    expect(prevLink).toBeTruthy()
    expect(backLink.textContent).toContain('$ cd ~/posts')
    expect(before(backLink, prevLink)).toBe(true)
    expect(before(prevLink, h1)).toBe(true)
  })

  it('下一篇位于正文 article 之后、评论区上方（<hr> 之前）', () => {
    const { container } = renderDetail()
    const nextLink = container.querySelector('a[href="/posts/next-post"]') as HTMLAnchorElement
    const articleEl = container.querySelector('article') as HTMLElement
    const hr = container.querySelector('hr') as HTMLElement
    const comments = container.querySelector('[data-testid="comments"]') as HTMLElement
    expect(nextLink).toBeTruthy()
    expect(articleEl).toBeTruthy()
    expect(hr).toBeTruthy()
    expect(before(articleEl, nextLink)).toBe(true)
    expect(before(nextLink, hr)).toBe(true)
    expect(before(hr, comments)).toBe(true)
  })

  it('prev/next 均为 null 时两侧按钮仍渲染（占位不跳转），tooltip 显示边界文案', () => {
    mocks.article = boundaryArticle
    const { container } = renderDetail()
    const links = [...container.querySelectorAll('a')].filter((a) =>
      /^\/posts\/.+/.test(a.getAttribute('href') ?? ''),
    )
    // 返回列表链接（/posts）之外不应有任何文章跳转链接
    expect(links).toHaveLength(0)
    expect(container.querySelector('a[href="/posts"]')).toBeTruthy()
    expect(container.textContent).toContain('开始看吧～')
    expect(container.textContent).toContain('看完了，去别处逛逛吧～')
    // 两个占位按钮仍渲染（布局稳定）
    expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(2)
  })
})
