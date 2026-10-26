// C 端数据 hooks（TanStack Query）：列表拉取、翻页收全量、评论增删的统一出口。
// 组件只消费 hooks，不再手写 useEffect + alive 旗标样板；
// mutation 成功后 invalidate 对应 query，列表自动重拉
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from './api'
import type {
  AboutAggregate,
  ArchiveItem,
  ArticleDetail,
  ArticleListItem,
  CommentNode,
  FriendLinkDTO,
  IdName,
  MomentDTO,
  UnlockResult,
} from '../types/api'

// 分页循环拉全量（page_size 上限 50）：C 端列表页需要完整数据集
async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ list: T[]; total: number }>,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; ; page++) {
    const d = await fetchPage(page)
    all.push(...d.list)
    if (d.list.length === 0 || all.length >= d.total) break
  }
  return all
}

// 关于页聚合：Hero / AboutPage / LinksPage 共享同一缓存

export function useAbout() {
  return useQuery({
    queryKey: ['about'],
    queryFn: () => api.get<AboutAggregate>('/api/about'),
  })
}

export function useLatestPosts() {
  return useQuery({
    queryKey: ['articles', 'latest'],
    queryFn: () =>
      api.get<{ list: ArticleListItem[]; total: number }>('/api/articles?page=1&page_size=5'),
  })
}

// 归档页与首页复用同一全量数据集（相同 query key 自动共享缓存）
export function useAllArticles() {
  return useArticleList({ categoryId: 0, keyword: '' })
}

export function useArticleList(filters: { categoryId: number; keyword: string }) {
  return useQuery({
    queryKey: ['articles', 'list', filters.categoryId, filters.keyword],
    queryFn: () =>
      fetchAllPages<ArticleListItem>((page) =>
        api.get(
          `/api/articles${qs({
            page,
            page_size: 50,
            category_id: filters.categoryId || undefined,
            keyword: filters.keyword || undefined,
          })}`,
        ),
      ),
  })
}

// 筛选条只展示有已发布文章挂靠的分类（used=1）
export function useCategories() {
  return useQuery({
    queryKey: ['categories', 'used'],
    queryFn: () => api.get<{ list: IdName[] }>('/api/categories?used=1').then((d) => d.list),
  })
}

export function useArticle(slug: string, unlockToken: string) {
  return useQuery({
    queryKey: ['article', slug, unlockToken],
    queryFn: () =>
      api.get<ArticleDetail>(
        `/api/articles/${slug}${unlockToken ? `?unlock_token=${encodeURIComponent(unlockToken)}` : ''}`,
      ),
  })
}

export function useUnlockArticle(slug: string) {
  return useMutation({
    mutationFn: (password: string) =>
      api.post<UnlockResult>(`/api/articles/${slug}/unlock`, { password }),
  })
}

export function useComments(slug: string) {
  return useQuery({
    queryKey: ['comments', slug],
    queryFn: () =>
      api.get<{ list: CommentNode[] }>(`/api/articles/${slug}/comments`).then((d) => d.list),
  })
}

export function useAddComment(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId?: number }) =>
      api.post<CommentNode>(
        `/api/articles/${slug}/comments`,
        parentId ? { content, parent_id: parentId } : { content },
        true,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', slug] }),
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments'] }),
  })
}

export function useMoments() {
  return useQuery({
    queryKey: ['moments', 'all'],
    queryFn: () =>
      fetchAllPages<MomentDTO>((page) => api.get(`/api/moments?page=${page}&page_size=50`)),
  })
}

// /moments/:id 无单条接口（契约 #M1）：翻页查找目标（博客量级小）
export function useMoment(id: string) {
  return useQuery({
    queryKey: ['moments', 'detail', id],
    queryFn: async () => {
      for (let page = 1; ; page++) {
        const d = await api.get<{ list: MomentDTO[]; total: number }>(
          `/api/moments?page=${page}&page_size=50`,
        )
        const found = d.list.find((m) => String(m.id) === id) ?? null
        if (found || d.list.length === 0) return found
      }
    },
  })
}

export function useArchiveIndex() {
  return useQuery({
    queryKey: ['archive'],
    queryFn: () => api.get<ArchiveItem[]>('/api/archive'),
  })
}

export function useFriendLinks() {
  return useQuery({
    queryKey: ['friend-links'],
    queryFn: () => api.get<{ list: FriendLinkDTO[] }>('/api/friend-links').then((d) => d.list),
  })
}

// 首页门户计数：空数据/失败时保持 0，不阻塞页面

export function useMomentsTotal() {
  return useQuery({
    queryKey: ['moments', 'total'],
    queryFn: () =>
      api
        .get<{ list: unknown[]; total: number }>('/api/moments?page=1&page_size=1')
        .then((d) => d.total),
  })
}
