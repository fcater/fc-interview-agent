import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, interviewApi, jdApi, resumeApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/use-current-user'
import type { components } from '@/api/schema'

type HealthResponse = components['schemas']['HealthResponse']

/** 首页：开始模拟面试（选简历 + JD）+ 登录用户信息 + 服务状态 */
export function HomePage() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
  })

  const resumes = useQuery({ queryKey: ['resumes'], queryFn: resumeApi.list })
  const jds = useQuery({ queryKey: ['jds'], queryFn: jdApi.list })
  const [resumeId, setResumeId] = useState<number | null>(null)
  const [jdId, setJdId] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const startInterview = async () => {
    if (!resumeId) return
    setStarting(true)
    setStartError(null)
    try {
      const session = await interviewApi.start({ resume_id: resumeId, jd_id: jdId })
      void navigate(`/interviews/${session.id}`)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : '创建面试会话失败')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">首页</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选择简历与岗位 JD，开始一场 AI 模拟面试（当前仅面试官模式，求职者模式后续提供）。
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>开始模拟面试</CardTitle>
          <CardDescription>
            AI 面试官将基于所选简历与 JD 提问，可随时提前结束；结束后可查看收尾总结。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">选择简历</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={resumeId ?? ''}
                onChange={(e) => setResumeId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="" disabled>
                  {resumes.isPending ? '加载中…' : '请选择简历'}
                </option>
                {resumes.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">选择 JD（可选）</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={jdId ?? ''}
                onChange={(e) => setJdId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">不使用 JD</option>
                {jds.data?.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {startError && <p className="text-sm text-destructive">{startError}</p>}
          <Button onClick={() => void startInterview()} disabled={!resumeId || starting}>
            {starting ? '正在创建…' : '开始面试'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>我的账号</CardTitle>
          <CardDescription>登录态来自 JWT（每次登录会作废之前的 Token）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">用户名</span>
            <span className="font-medium">{me.data?.username}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">用户 ID</span>
            <span className="font-mono">{me.data?.id}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">注册时间</span>
            <span>
              {me.data
                ? new Date(me.data.created_at).toLocaleString('zh-CN', { hour12: false })
                : '—'}
            </span>
          </div>
        </CardContent>
      </Card>

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
