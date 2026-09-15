/**
 * 面试记录页（M5）：历史面试列表（会话概要 + 简历/JD 标题 + 综合评分），
 * 点击进入会话页查看复盘报告。数据按用户隔离（后端 E7）。
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ClipboardList, Loader2, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { interviewApi } from '@/lib/api'

const STATUS_LABEL: Record<string, string> = {
  in_progress: '进行中',
  completed: '已完成',
  aborted: '已结束',
}

/** 历史面试列表：按时间倒序，评分列显示综合分或生成状态 */
export function InterviewsPage() {
  const records = useQuery({ queryKey: ['interviews'], queryFn: interviewApi.list })

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">面试记录</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          历史面试列表；结束后评分报告将自动生成，点击进入查看复盘。
        </p>
      </section>

      <Card>
        <CardContent className="p-0">
          {records.isPending && (
            <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </p>
          )}
          {records.isError && (
            <p className="p-6 text-sm text-destructive">{records.error.message}</p>
          )}
          {records.data && records.data.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">还没有面试记录，从首页发起一场吧。</p>
          )}
          <ul className="divide-y">
            {records.data?.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/interviews/${r.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/50"
                >
                  <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {r.resume_title ?? '未关联简历'}
                      <span className="mx-1.5 text-muted-foreground">×</span>
                      {r.jd_title ?? '未关联 JD'}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{r.role === 'interviewer' ? '面试官模式' : '求职者模式'}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <MessageSquare className="size-3" />
                        {r.question_count} 题
                      </span>
                      <span>
                        {new Date(r.created_at).toLocaleString('zh-CN', { hour12: false })}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    <ScoreBadge score={r.overall_score} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

/** 综合评分徽章：未生成时显示"报告中"（异步生成中） */
function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        报告中
      </span>
    )
  }
  return <span className="text-sm font-semibold text-primary">{score} 分</span>
}
