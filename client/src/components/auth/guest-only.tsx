/**
 * 路由守卫（仅访客页面：登录 / 注册）：
 * 已持有 Token 时直接回首页，避免重复登录。
 */

import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'

export function GuestOnly() {
  const token = useAuthStore((state) => state.token)

  if (token) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
