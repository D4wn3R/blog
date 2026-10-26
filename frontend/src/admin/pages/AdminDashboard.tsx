import { Link } from 'react-router'
import { Card, PageHeader } from '../components/ui'
import { useAdminStats } from '../queries'
import { ArrowRight, Article, Heart, ListChecks, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

// 三卡真数据（契约无统计接口，"本周增量"已砍）：
// 文章/动态取分页包 total，友链为全量 list 长度；任一路失败计 null 展示 —
export function AdminDashboard() {
  const stats = useAdminStats()

  const STATS = [
    { label: '文章', icon: Article, total: stats.data?.postsTotal ?? null },
    { label: '动态', icon: ListChecks, total: stats.data?.momentsTotal ?? null },
    { label: '友链', icon: Heart, total: stats.data?.linksTotal ?? null },
  ]

  const QUICK_LINKS = [
    { to: '/admin/posts/edit', label: '写文章', icon: Plus, primary: true },
    { to: '/admin/moments/new', label: '发动态' },
    { to: '/admin/links/new', label: '加友链' },
  ]

  return (
    <div className="p-8">
      <PageHeader title="仪表盘" description="$ admin@D4wn3R:~$ whoami" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STATS.map(({ label, icon: Icon, total }) => (
          <Card key={label} className="p-5 transition-colors hover:border-neon/40">
            <div className="flex items-center justify-between">
              <span className="text-sm text-dim">{label}</span>
              <Icon size={18} className="text-faint" />
            </div>
            <p className="mt-3 font-mono text-3xl font-semibold text-neon">{total ?? '—'}</p>
          </Card>
        ))}
      </div>

      <div className="mt-10 max-w-md">
        <h2 className="mb-4 font-semibold text-ink">快捷操作</h2>
        <div className="flex flex-col gap-3">
          {QUICK_LINKS.map(({ to, label, icon: Icon, primary }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex h-12 items-center justify-between rounded-lg border px-4 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/40',
                primary
                  ? 'border-neon/60 bg-neon/10 font-medium text-neon hover:bg-neon hover:text-void'
                  : 'border-edge text-dim hover:border-neon/50 hover:text-neon',
              )}
            >
              <span className="flex items-center gap-2">
                {Icon && <Icon size={15} weight="bold" />}
                {label}
              </span>
              <ArrowRight size={14} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
