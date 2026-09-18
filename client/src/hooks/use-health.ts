/**
 * 服务健康状态（/health，30s 轮询）：与布局 ServiceStatus 共享同一 queryKey 缓存，
 * 任意组件挂载即复用轮询结果，不产生额外请求。
 * useLlmReady 用于禁用依赖 LLM 的按钮：默认（加载中 / 未知 / down）一律不可用，
 * 仅在后端明确上报 llm="up" 时才放行——宁可多禁，不放漏网。
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { components } from '@/api/schema'

type HealthResponse = components['schemas']['HealthResponse']

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    refetchInterval: 30_000,
    retry: 1,
  })
}

/** LLM 是否就绪（仅明确 up 时为 true；加载中 / 未知 / down 均视为不可用） */
export function useLlmReady(): boolean {
  const health = useHealthQuery()
  return health.data?.llm === 'up'
}
