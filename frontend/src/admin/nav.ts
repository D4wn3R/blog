import { Article, ChartLine, Heart, ListChecks } from '@phosphor-icons/react'

// B 端侧栏导航（AdminLayout 与潜在复用方共用）
export const ADMIN_NAV = [
  { label: '仪表盘', to: '/admin', icon: ChartLine, end: true },
  { label: '文章管理', to: '/admin/posts', icon: Article },
  { label: '动态管理', to: '/admin/moments', icon: ListChecks },
  { label: '友链管理', to: '/admin/links', icon: Heart },
  { label: '关于页', to: '/admin/about', icon: ListChecks },
]
