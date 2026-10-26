import { ArrowUp, EnvelopeSimple, GithubLogo, Rss } from '@phosphor-icons/react'

export function Footer() {
  return (
    <footer className="border-t border-edge">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-sm text-dim">© 2026 D4wn3R</p>
          <p className="mt-1.5 font-mono text-xs text-faint">
            powered by Go &amp; React
          </p>
        </div>

        <div className="flex items-center gap-2">
          {[
            { icon: GithubLogo, label: 'GitHub', href: '#' },
            { icon: EnvelopeSimple, label: '邮件', href: '#' },
            { icon: Rss, label: 'RSS 订阅', href: '/feed.xml' },
          ].map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              className="flex h-9 w-9 items-center justify-center border border-edge text-dim transition-colors hover:border-neon/60 hover:text-neon"
            >
              <Icon size={17} />
            </a>
          ))}
          <a
            href="#"
            aria-label="回到顶部"
            className="ml-2 flex h-9 w-9 items-center justify-center border border-edge text-dim transition-colors hover:border-neon/60 hover:text-neon"
          >
            <ArrowUp size={17} />
          </a>
        </div>
      </div>
    </footer>
  )
}
