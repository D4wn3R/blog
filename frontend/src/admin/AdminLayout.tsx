import { NavLink, Outlet, useNavigate } from 'react-router'
import { ArrowSquareOut, SignOut } from '@phosphor-icons/react'
import { errMsg } from '../lib/api'
import { logout } from '../lib/auth'
import { useAuthStore } from '../lib/authStore'
import { useAbout } from '../lib/queries'
import { LinkButton } from './components/ui'
import { ADMIN_NAV } from './nav'

export function AdminLayout() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  // 守卫在 RequireAdmin：走到这里必有用户（仅兜底防 TS 可空收窄丢失）
  const username = user?.username ?? ''
  const role = user?.role ?? ''

  // 侧栏头像统一取本节点 site_image（与友链页/关于页同源）：失败显示错误态，
  // 未设置 → 明确的"未设置头像"空态
  const about = useAbout()
  const avatar = {
    status: about.isPending
      ? ('loading' as const)
      : about.isError
        ? ('error' as const)
        : ('ok' as const),
    src: about.data?.settings.site_image,
    msg: about.isError ? errMsg(about.error) : undefined,
  }

  // 登录守卫由外层 RequireAdmin 承担（登出/过期即时反映到守卫与侧栏）
  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-panel">
        <div className="border-b border-edge px-5 py-4">
          <NavLink to="/admin" className="font-mono text-sm text-neon">
            ~/D4wn3R<span className="text-faint">/admin</span>
          </NavLink>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-faint">CONSOLE</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {ADMIN_NAV.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'border-neon bg-neon/10 text-neon'
                    : 'border-transparent text-dim hover:bg-panel-2 hover:text-ink'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-edge p-4">
          <div className="flex items-center gap-3">
            {avatar.status === 'error' ? (
              <div
                title={`头像加载失败：${avatar.msg}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pulse/60 font-mono text-xs text-pulse"
              >
                !
              </div>
            ) : avatar.status === 'ok' && avatar.src ? (
              <img
                src={avatar.src}
                alt={`${username} 的头像`}
                className="h-10 w-10 rounded-full border border-edge object-cover"
              />
            ) : avatar.status === 'ok' ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-edge font-mono text-[8px] leading-tight text-faint">
                无头像
              </div>
            ) : (
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full border border-edge bg-void" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{username}</p>
              <p className="font-mono text-[10px] text-faint">role: {role}</p>
            </div>
            <button
              type="button"
              aria-label="退出登录"
              title="退出登录"
              onClick={() => {
                // #7 登出：无论接口结果都清本地凭证后回登录页
                void logout().finally(() => navigate('/admin/login'))
              }}
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-panel-2 hover:text-pulse"
            >
              <SignOut size={14} />
            </button>
          </div>
          <LinkButton variant="secondary" size="sm" to="/" className="mt-3 w-full">
            <ArrowSquareOut size={13} />
            查看站点
          </LinkButton>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
