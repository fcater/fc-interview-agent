/**
 * 认证 UI 状态（zustand）：只存 Token（响应式），持久化走 tokenStore（localStorage）。
 * 当前用户信息属于服务端状态，由 useCurrentUser（TanStack Query）管理。
 */

import { create } from 'zustand'
import { tokenStore } from '@/lib/api'

interface AuthState {
  token: string | null
  setToken: (token: string) => void
  clearToken: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: tokenStore.get(),
  setToken: (token) => {
    tokenStore.set(token)
    set({ token })
  },
  clearToken: () => {
    tokenStore.clear()
    set({ token: null })
  },
}))
