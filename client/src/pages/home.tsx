import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { components } from '@/api/schema'

type HealthResponse = components['schemas']['HealthResponse']

/** 首页占位页：验证「前端 → /api 代理 → 后端 /health」全链路 */
export function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
  })

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">首页</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          M0 工程骨架已就绪。后续里程碑将提供：简历管理、JD 管理、AI 模拟面试与面试复盘。
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>服务状态</CardTitle>
          <CardDescription>前端通过 /api 代理请求后端 /health</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {health.isPending && <p className="text-muted-foreground">正在检查…</p>}

          {health.isError && (
            <div className="space-y-3">
              <StatusRow label="后端服务" ok={false} text="不可达（请确认后端已启动）" />
              <Button size="sm" variant="outline" onClick={() => void health.refetch()}>
                重试
              </Button>
            </div>
          )}

          {health.data && (
            <>
              <StatusRow
                label="整体状态"
                ok={health.data.status === 'ok'}
                text={overallStatusText(health.data)}
              />
              <StatusRow label="后端服务" ok text="在线" />
              <StatusRow
                label="数据库"
                ok={health.data.database === 'up'}
                text={
                  health.data.database === 'up'
                    ? '已连接'
                    : health.data.database === 'down'
                      ? '未连接（请 docker compose up -d）'
                      : '未知'
                }
              />
              <StatusRow
                label="LLM 模式"
                ok
                text={
                  health.data.app_llm_mode === 'local'
                    ? 'local（本机 Ollama）'
                    : 'online（在线模型）'
                }
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function overallStatusText(health: HealthResponse): string {
  switch (health.status) {
    case 'ok':
      return '正常'
    case 'degraded':
      return '降级（依赖不可用）'
    case 'error':
      return `异常（${health.detail ?? '未知错误'}）`
  }
}

function StatusRow({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className={cn('size-2 rounded-full', ok ? 'bg-green-500' : 'bg-red-500')} />
        {text}
      </span>
    </div>
  )
}
