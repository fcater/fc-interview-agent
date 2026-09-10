/**
 * 路由守卫（受保护页面）：
 * - 无 Token → 跳登录页（携带来源路径，登录后回跳）
 * - 有 Token 但 /users/me 校验中 → 全页加载态
 * - Token 失效（401）→ useCurrentUser 自动清除 Token，本组件随之跳登录
 * - 其他错误（如后端不可达）→ 错误面板 + 重试
 */

import { Navigate, Outlet, useLocation } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useAuthStore } from '@/stores/auth-store'

export function RequireAuth() {
  const token = useAuthStore((state) => state.token)
  const location = useLocation()
  const me = useCurrentUser()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (me.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" />
        正在校验登录状态…
      </div>
    )
  }

  if (me.isError) {
    return (
      <div className="mx-auto max-w-sm space-y-4 py-24 text-center">
        <p className="text-sm text-muted-foreground">
          无法获取用户信息：{me.error instanceof Error ? me.error.message : '未知错误'}
        </p>
        <Button size="sm" variant="outline" onClick={() => me.refetch()}>
          重试
        </Button>
      </div>
    )
  }

  return <Outlet />
}
