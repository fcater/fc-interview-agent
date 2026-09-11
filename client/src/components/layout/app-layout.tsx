import { Link, NavLink, Outlet } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useAuthStore } from '@/stores/auth-store'

/** 全站布局：顶部导航感知登录态（访客见登录/注册，用户见用户名 + 退出） */
export function AppLayout() {
  const token = useAuthStore((state) => state.token)
  const clearToken = useAuthStore((state) => state.clearToken)
  const queryClient = useQueryClient()
  const me = useCurrentUser()

  const logout = () => {
    clearToken()
    queryClient.removeQueries({ queryKey: ['me'] })
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            AI 面试模拟 Agent
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) => navLinkClass(isActive)}
            >
              首页
            </NavLink>
            {token && (
              <>
                <NavLink to="/resumes" className={({ isActive }) => navLinkClass(isActive)}>
                  简历
                </NavLink>
                <NavLink to="/jds" className={({ isActive }) => navLinkClass(isActive)}>
                  JD
                </NavLink>
              </>
            )}
            {token ? (
              <>
                <span className="px-3 text-sm text-muted-foreground">
                  {me.data?.username ?? '…'}
                </span>
                <Button variant="ghost" size="sm" onClick={logout}>
                  <LogOut />
                  退出
                </Button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={({ isActive }) => navLinkClass(isActive)}>
                  登录
                </NavLink>
                <NavLink to="/register" className={({ isActive }) => navLinkClass(isActive)}>
                  注册
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function navLinkClass(isActive: boolean): string {
  return cn(
    'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
    isActive && 'bg-accent font-medium text-accent-foreground',
  )
}
