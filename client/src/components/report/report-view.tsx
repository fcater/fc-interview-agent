import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InterviewReport } from '@/lib/api'

/** 评分报告视图：雷达图（维度随 rubric 模板动态）+ 综合评分 + 问题/建议（M5） */
export function ReportView({ report }: { report: InterviewReport }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-full bg-primary/10">
          <span className="text-2xl font-semibold text-primary">{report.overall_score}</span>
          <span className="text-xs text-muted-foreground">综合评分</span>
        </div>
        <div className="h-40 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={report.dimensions} outerRadius="80%">
              <PolarGrid />
              <PolarAngleAxis dataKey="name" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.35} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {report.dimensions.map((dim) => (
          <div key={dim.name} className="rounded-md border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{dim.name}</span>
              <span className="font-semibold text-primary">{dim.score}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{dim.comment}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ReportList title="主要问题" items={report.main_problems} />
        <ReportList title="改进建议" items={report.improvements} />
      </div>
    </div>
  )
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">无</p>
        ) : (
          items.map((item, i) => (
            <p key={i} className="text-xs leading-relaxed text-muted-foreground">
              {i + 1}. {item}
            </p>
          ))
        )}
      </CardContent>
    </Card>
  )
}
