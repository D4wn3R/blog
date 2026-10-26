import { Navigate } from 'react-router'
import { useAuthStore } from '../../lib/authStore'
import type { ReactNode } from 'react'

// B 端登录守卫：后端 AuthRequired + AdminRequired 的前端镜像（登录态 = authStore）。
// 独立组件供 AdminLayout 与全屏写文章页（不经 AdminLayout）共用，避免守卫逻辑重复
export function RequireAdmin({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)

  if (!accessToken || user?.role !== 'admin') {
    return <Navigate to="/admin/login" replace />
  }
  return <>{children}</>
}
