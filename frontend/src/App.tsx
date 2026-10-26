import { lazy, Suspense, useEffect } from 'react'
import { Outlet, Route, Routes, useLocation } from 'react-router'
import { AdminLayout } from './admin/AdminLayout'
import { RequireAdmin } from './admin/components/RequireAdmin'
import { OAuthCallback } from './pages/OAuthCallback'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Footer } from './components/Footer'
import { Nav } from './components/Nav'
import { guardStaleChunk } from './lib/chunk'

// 重型路由懒加载：B 端全部页面 + 两端详情页 + C 端内容页；
// 壳组件（Nav/Footer/SiteLayout/OAuthCallback/AdminLayout）保持静态。
// 具名导出经 then 映射成 default 供 lazy 使用
const AdminAbout = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/AdminAbout').then((m) => ({ default: m.AdminAbout })),
  ),
)
const AdminDashboard = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
  ),
)
const AdminLinks = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/AdminLinks').then((m) => ({ default: m.AdminLinks })),
  ),
)
const AdminLogin = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/AdminLogin').then((m) => ({ default: m.AdminLogin })),
  ),
)
const AdminMoments = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/AdminMoments').then((m) => ({ default: m.AdminMoments })),
  ),
)
const AdminPostEditor = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/AdminPostEditor').then((m) => ({ default: m.AdminPostEditor })),
  ),
)
const AdminPosts = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/AdminPosts').then((m) => ({ default: m.AdminPosts })),
  ),
)
const FriendLinkForm = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/FriendLinkForm').then((m) => ({ default: m.FriendLinkForm })),
  ),
)
const MomentForm = lazy(
  guardStaleChunk(() =>
    import('./admin/pages/MomentForm').then((m) => ({ default: m.MomentForm })),
  ),
)
const ArticleDetail = lazy(
  guardStaleChunk(() =>
    import('./pages/article-detail/ArticleDetail').then((m) => ({ default: m.ArticleDetail })),
  ),
)
const ParticlesFX = lazy(guardStaleChunk(() => import('./components/ParticlesFX')))
const MomentDetail = lazy(
  guardStaleChunk(() => import('./pages/MomentDetail').then((m) => ({ default: m.MomentDetail }))),
)
const AboutPage = lazy(
  guardStaleChunk(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage }))),
)
const ArchivePage = lazy(
  guardStaleChunk(() => import('./pages/ArchivePage').then((m) => ({ default: m.ArchivePage }))),
)
const HomePage = lazy(
  guardStaleChunk(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage }))),
)
const LinksPage = lazy(
  guardStaleChunk(() => import('./pages/LinksPage').then((m) => ({ default: m.LinksPage }))),
)
const Login = lazy(
  guardStaleChunk(() => import('./pages/Login').then((m) => ({ default: m.Login }))),
)
const MomentsPage = lazy(
  guardStaleChunk(() => import('./pages/MomentsPage').then((m) => ({ default: m.MomentsPage }))),
)
const PostsPage = lazy(
  guardStaleChunk(() => import('./pages/PostsPage').then((m) => ({ default: m.PostsPage }))),
)

// chunk 加载期占位（对齐全站 loading 态的 mono 风格）
function LoadingFallback() {
  return <p className="py-10 font-mono text-sm text-faint">loading...</p>
}

// z-index 体系：背景氛围层 -10（fixed + pointer-events-none），导航 40，其余默认
// 星点粒子层仅非文章详情页启用，夹在 glow 与 scanline 之间；文章页保持纯静态背景
function BackgroundFX({ particles }: { particles: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <div className="bg-grid absolute inset-0" />
      <div className="bg-glow absolute inset-0" />
      {particles && (
        <Suspense fallback={null}>
          <ParticlesFX />
        </Suspense>
      )}
      <div className="bg-scanline absolute inset-0" />
    </div>
  )
}

// SPA 路由切换后回到页首
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// C 端站点外壳：导航 + 内容 + 页脚
// 路由内容按 pathname keyed remount，借 Animate.css 每次切换重放一次快速淡入
function SiteLayout() {
  const { pathname } = useLocation()
  const isArticle = /^\/posts\/[^/]+/.test(pathname)
  return (
    <div className="flex min-h-dvh flex-col">
      <BackgroundFX particles={!isArticle} />
      <Nav />
      <main className="flex grow flex-col">
        <div
          key={pathname}
          className="animate__animated animate__fadeIn animate__faster flex grow flex-col"
        >
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  const { pathname } = useLocation()
  return (
    <>
      <ScrollToTop />
      {/* pathname 作 resetKey：路由切换即重置 boundary，错误态不会跨路由滞留 */}
      <ErrorBoundary resetKeys={[pathname]}>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* OAuth 回调落地（后端 #3 永远 302 到 /oauth/callback），独立于两端外壳 */}
            <Route path="/oauth/callback" element={<OAuthCallback />} />

            {/* B 端（概念稿）：独立控制台外壳。RequireAdmin 挂外壳层：
                写文章页是全屏沉浸式（不经 AdminLayout），守卫须独立覆盖 */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/admin/posts/edit"
              element={
                <RequireAdmin>
                  <AdminPostEditor />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="posts" element={<AdminPosts />} />
              <Route path="about" element={<AdminAbout />} />
              <Route path="links" element={<AdminLinks />} />
              <Route path="moments" element={<AdminMoments />} />
              <Route path="links/new" element={<FriendLinkForm />} />
              <Route path="links/:id/edit" element={<FriendLinkForm />} />
              <Route path="moments/new" element={<MomentForm />} />
              <Route path="moments/:id/edit" element={<MomentForm />} />
            </Route>

            {/* C 端 */}
            <Route element={<SiteLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/posts" element={<PostsPage />} />
              <Route path="/posts/:slug" element={<ArticleDetail />} />
              <Route path="/moments" element={<MomentsPage />} />
              <Route path="/moments/:id" element={<MomentDetail />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/links" element={<LinksPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  )
}
