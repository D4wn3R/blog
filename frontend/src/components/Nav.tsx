import { useState } from 'react'
import { NavLink } from 'react-router'
import { List, X } from '@phosphor-icons/react'
import { cn } from '../lib/cn'

const NAV_LINKS = [
  { label: '文章', to: '/posts' },
  { label: '动态', to: '/moments' },
  { label: '归档', to: '/archive' },
  { label: '友链', to: '/links' },
  { label: '关于', to: '/about' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn('text-sm transition-colors', isActive ? 'text-neon' : 'text-dim hover:text-neon')

export function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="animate__animated animate__fadeInDown animate__fast sticky top-0 z-40 border-b border-edge bg-void/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <NavLink to="/" className="font-mono text-base text-neon transition-colors hover:text-ink">
          ~/D4wn3R
          <span className="cursor-blink ml-0.5" aria-hidden="true">
            ▊
          </span>
        </NavLink>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? '关闭菜单' : '打开菜单'}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center border border-edge text-dim transition-colors hover:text-neon md:hidden"
        >
          {open ? <X size={18} /> : <List size={18} />}
        </button>
      </nav>

      {open && (
        <div className="animate__animated animate__fadeInDown animate__faster border-t border-edge bg-void/95 px-6 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className={linkClass}
              >
                <span className="block py-2.5">{link.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
