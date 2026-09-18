import { Card, CardContent } from '@/components/ui/card'
import type { InterviewReport } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * 评分报告视图（内容分布对照原型 demo）：
 * 左：深蓝分数卡（conic 分数环 + 一句话评语）；右：维度评分 2×2 卡；
 * 下：主要问题 / 改进建议 双栏。雷达图已按 demo 布局移除（维度卡承载同样信息）。
 */
export function ReportView({ report }: { report: InterviewReport }) {
  const tier =
    report.overall_score >= 85 ? '表现出色' : report.overall_score >= 70 ? '本次表现不错' : '继续加油'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[290px_1fr]">
        {/* 分数卡 */}
        <div className="bg-sidebar-gradient relative overflow-hidden rounded-2xl p-6 text-center text-white">
          <div className="bg-glow pointer-events-none absolute -top-16 -right-12 size-44 rounded-full opacity-70" />
          <div className="relative">
            <p className="text-[11px] font-bold tracking-[0.14em] text-sidebar-foreground uppercase">
              Overall Score
            </p>
            <ScoreRing score={report.overall_score} />
            <h3 className="text-sidebar-accent-foreground text-base font-semibold">{tier}</h3>
            <p className="mt-1 text-[11px] text-sidebar-foreground">
              满分 100 · {report.dimensions.length} 个维度评分
            </p>
          </div>
        </div>

        {/* 维度评分 2×2 */}
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {report.dimensions.map((dim) => (
            <div key={dim.name} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{dim.name}</span>
                <span className="text-brand-gradient text-xl font-bold">{dim.score}</span>
              </div>
              <div className="my-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-brand-gradient h-full rounded-full"
                  style={{ width: `${Math.min(100, dim.score)}%` }}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{dim.comment}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 主要问题 / 改进建议 */}
      <div className="grid gap-4 md:grid-cols-2">
        <ReportList
          title="主要问题"
          badge={`${report.main_problems.length} 项`}
          tone="destructive"
          items={report.main_problems}
        />
        <ReportList title="改进建议" badge="下一步" tone="success" items={report.improvements} />
      </div>
    </div>
  )
}

/** 分数环：conic-gradient（轨道用侧栏色系，与深蓝分数卡同底） */
function ScoreRing({ score }: { score: number }) {
  const deg = Math.max(0, Math.min(100, score)) * 3.6
  return (
    <div
      className="relative mx-auto my-4 grid size-36 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--primary) ${deg}deg, rgb(255 255 255 / 0.12) ${deg}deg)`,
      }}
    >
      <div className="absolute inset-2.5 rounded-full bg-sidebar" />
      <div className="relative flex flex-col items-center">
        <span className="text-4xl font-bold tracking-tight">{score}</span>
        <span className="text-[10px] text-sidebar-foreground">/ 100</span>
      </div>
    </div>
  )
}

/** 问题 / 建议列表卡：标题 + 计数徽章 + 编号软色条目 */
function ReportList({
  title,
  badge,
  items,
  tone,
}: {
  title: string
  badge: string
  items: string[]
  tone: 'destructive' | 'success'
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-bold',
              tone === 'destructive' ? 'bg-destructive-soft text-destructive' : 'bg-success-soft text-success-foreground',
            )}
          >
            {badge}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">无</p>
        ) : (
          <div className="grid gap-2">
            {items.map((item, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-xl px-3.5 py-2.5 text-xs leading-relaxed',
                  tone === 'destructive'
                    ? 'border border-destructive/20 bg-destructive-soft'
                    : 'border border-success/20 bg-success-soft',
                )}
              >
                <b className={tone === 'destructive' ? 'text-destructive' : 'text-success-foreground'}>
                  {String(i + 1).padStart(2, '0')} ·{' '}
                </b>
                {item}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
