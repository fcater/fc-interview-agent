/**
 * 当前用户（TanStack Query）：有 Token 时请求 /users/me 校验并加载用户。
 * Token 失效（401）时自动清除，触发路由守卫跳回登录页。
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, ApiError } from '@/lib/api'
import type { UserResponse } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

export function useCurrentUser() {
  const token = useAuthStore((state) => state.token)
  const clearToken = useAuthStore((state) => state.clearToken)
  const queryClient = useQueryClient()

  const me = useQuery<UserResponse>({
    queryKey: ['me'],
    queryFn: authApi.me,
    enabled: Boolean(token),
    retry: false,
    staleTime: 5 * 60_000,
  })

  // 401 = Token 已失效（过期 / 重新登录后旧 Token 被作废）：清除并回到登录页
  useEffect(() => {
    if (me.isError && me.error instanceof ApiError && me.error.status === 401) {
      clearToken()
      queryClient.removeQueries({ queryKey: ['me'] })
    }
  }, [me.isError, me.error, clearToken, queryClient])

  return me
}
