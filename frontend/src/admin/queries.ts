// B 端数据 hooks（TanStack Query）：列表分页、计数、删除/状态切换等写操作的统一出口。
// invalidate 策略：写操作成功后失效对应查询键，列表与计数自动重拉；
// C 端共享数据源（友链/动态）使用相同 query key，写后 C 端缓存一并失效
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import type { PageDTO } from '../types/page'
import type {
  AdminArticleDetail,
  AdminArticleListItem,
  FriendLinkDTO,
  IdName,
  MomentDTO,
} from '../types/api'

const POST_PAGE_SIZE = 10

// 编辑器元信息候选池：全量分类/标签（区别于 C 端 used=1 筛选条）
export function useAllCategories() {
  return useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.get<{ list: IdName[] }>('/api/categories').then((d) => d.list),
  })
}

export function useAllTags() {
  return useQuery({
    queryKey: ['admin', 'tags'],
    queryFn: () => api.get<{ list: IdName[] }>('/api/tags').then((d) => d.list),
  })
}

// #A5 全字段详情（编辑回显）
export function useAdminArticle(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'article', id],
    queryFn: () => api.getAuth<AdminArticleDetail>(`/api/admin/articles/${id}`),
    enabled: id !== null && id !== '',
  })
}

export function useAdminArticles(page: number, status?: 1 | 2) {
  return useQuery({
    queryKey: ['admin', 'articles', page, status ?? 'all'],
    queryFn: () =>
      api.getAuth<PageDTO<AdminArticleListItem>>(
        `/api/admin/articles${qs({ page, page_size: POST_PAGE_SIZE, status })}`,
      ),
  })
}

// tab 上的三路计数：各自独立失败容忍（失败计 null 展示 —），与原实现语义一致
export function useAdminArticleCounts() {
  return useQuery({
    queryKey: ['admin', 'article-counts'],
    queryFn: async () => {
      const fetchTotal = (status?: 1 | 2) =>
        api
          .getAuth<PageDTO<AdminArticleListItem>>(
            `/api/admin/articles${qs({ page: 1, page_size: 1, status })}`,
          )
          .then((d) => d.total)
          .catch(() => null)
      const [all, published, hidden] = await Promise.all([
        fetchTotal(),
        fetchTotal(1),
        fetchTotal(2),
      ])
      return { all, published, hidden } as Record<'all' | 'published' | 'hidden', number | null>
    },
  })
}

// 隐藏/发布切换：#A7 全量替换语义 → 先 #A5 拉全字段，改 status 后原样提交
export function useToggleArticleStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (post: AdminArticleListItem) => {
      const detail = await api.getAuth<AdminArticleDetail>(`/api/admin/articles/${post.id}`)
      await api.put(`/api/admin/articles/${post.id}`, {
        title: detail.title,
        slug: detail.slug,
        content_md: detail.content_md,
        summary: detail.summary,
        cover_url: detail.cover_url,
        category_id: detail.category_id,
        tag_ids: detail.tags.map((t) => t.id),
        pinned: detail.pinned,
        status: detail.status === 1 ? 2 : 1,
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'articles'] })
      void qc.invalidateQueries({ queryKey: ['admin', 'article-counts'] })
    },
  })
}

// 契约 D-hard-delete：物理删除无回收站
export function useDeleteArticle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/admin/articles/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'articles'] })
      void qc.invalidateQueries({ queryKey: ['admin', 'article-counts'] })
    },
  })
}

const MOMENT_PAGE_SIZE = 20

export function useAdminMoments(page: number) {
  return useQuery({
    queryKey: ['moments', 'admin', page],
    queryFn: () =>
      api.get<PageDTO<MomentDTO>>(`/api/moments${qs({ page, page_size: MOMENT_PAGE_SIZE })}`),
  })
}

// #M4 物理删除，不存在幂等成功
export function useDeleteMoment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/admin/moments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['moments'] }),
  })
}

// 友链管理：列表与 C 端共享 ['friend-links'] 键，写后两端缓存同步失效

export function useAdminFriendLinks() {
  return useQuery({
    queryKey: ['friend-links'],
    queryFn: () => api.get<{ list: FriendLinkDTO[] }>('/api/friend-links').then((d) => d.list),
  })
}

// #F4 物理删除
export function useDeleteFriendLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/admin/friend-links/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['friend-links'] }),
  })
}

// 仪表盘三卡：契约无统计接口，计数分别取分页 total / list 长度

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const grab = async <T>(p: Promise<T>): Promise<T | null> => {
        try {
          return await p
        } catch {
          return null
        }
      }
      const [postsTotal, momentsTotal, linksTotal] = await Promise.all([
        grab(
          api
            .getAuth<PageDTO<AdminArticleListItem>>('/api/admin/articles?page_size=1')
            .then((d) => d.total),
        ),
        grab(api.get<PageDTO<MomentDTO>>('/api/moments?page_size=1').then((d) => d.total)),
        grab(api.get<{ list: FriendLinkDTO[] }>('/api/friend-links').then((d) => d.list.length)),
      ])
      return { postsTotal, momentsTotal, linksTotal }
    },
  })
}
