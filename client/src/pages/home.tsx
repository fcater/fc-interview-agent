import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, Bot, Sparkles, SquareUser } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AiCharacter } from "@/components/ai-character";
import { interviewApi, jdApi, resumeApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLlmReady } from "@/hooks/use-health";

type InterviewRecord = Awaited<ReturnType<typeof interviewApi.list>>[number];

/** 工作台仪表盘：hero + 数据概览四格 + 最近面试 / 得分趋势（内容分布对照原型 demo） */
export function HomePage() {
  const llmReady = useLlmReady();
  const resumes = useQuery({ queryKey: ["resumes"], queryFn: resumeApi.list });
  const jds = useQuery({ queryKey: ["jds"], queryFn: jdApi.list });
  const records = useQuery({ queryKey: ["interviews"], queryFn: interviewApi.list });

  const list = records.data ?? [];
  const scored = list
    .filter((r) => r.role === "interviewer" && r.status === "completed" && r.overall_score != null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const avg = scored.length
    ? Math.round(scored.slice(-5).reduce((s, r) => s + (r.overall_score ?? 0), 0) / Math.min(scored.length, 5))
    : null;
  const best = scored.length
    ? scored.reduce((m, r) => ((r.overall_score ?? 0) > (m.overall_score ?? 0) ? r : m))
    : null;

  return (
    <div className="space-y-5">
      {/* Hero：左侧欢迎语 + 右侧 AI 特性卡 */}
      <section className="grid gap-4 lg:grid-cols-[1.5fr_.85fr]">
        <div className="relative flex min-h-56 items-center overflow-hidden rounded-2xl border border-primary/15 bg-linear-to-br from-accent via-background to-card p-7">
          <div className="bg-glow pointer-events-none absolute -right-16 -bottom-24 size-64 rounded-full" />
          <AiCharacter index={1} className="pointer-events-none absolute right-4 bottom-0 hidden h-44 md:block" />
          <div className="relative">
            <p className="text-brand-gradient mb-2 text-xs font-bold tracking-[0.14em] uppercase">
              AI Interview Workspace
            </p>
            <h1 className="max-w-xl text-3xl leading-tight font-semibold tracking-tight">准备好下一场面试了吗？</h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              基于你的真实简历和目标岗位 JD，让 AI 进行针对性的模拟面试，并在结束后给出结构化复盘。
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {/* Link 不匹配 :disabled 伪类，用 pointer-events 类禁用（下同） */}
              <Button asChild aria-disabled={!llmReady} className={cn(!llmReady && "pointer-events-none opacity-50")}>
                <Link to="/start">
                  开始一次面试
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/interviews">查看历史记录</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-sidebar-gradient relative overflow-hidden rounded-2xl p-6 text-sidebar-foreground">
          <div className="bg-glow pointer-events-none absolute -top-14 -right-12 size-48 rounded-full opacity-70" />
          <div className="relative flex h-full flex-col">
            <p className="text-xs font-semibold text-sidebar-accent-foreground">AI Interview Agent</p>
            <div className="bg-brand-gradient my-4 grid size-14 place-items-center rounded-2xl shadow-lg shadow-primary/40">
              <Sparkles className="size-6" />
            </div>
            <h3 className="relative text-base font-semibold text-sidebar-accent-foreground">你的专属面试官</h3>
            <p className="mt-1 mb-4 text-xs leading-relaxed text-sidebar-foreground/90">
              会根据简历、JD 和你的回答动态追问，不只是固定题库。
            </p>
            <div className="relative mt-auto flex flex-wrap gap-1.5">
              <FeaturePill>简历 RAG · {resumes.data?.length ?? 0} 份</FeaturePill>
              <FeaturePill>目标岗位 · {jds.data?.length ?? 0} 个</FeaturePill>
              <FeaturePill>流式输出</FeaturePill>
            </div>
          </div>
        </div>
      </section>

      {/* 数据概览四格（demo: grid4 stats） */}
      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="累计面试"
          value={String(list.filter((r) => r.role === "interviewer").length)}
          hint={`面试官 ${list.filter((r) => r.role === "interviewer").length} · 求职者 ${list.filter((r) => r.role === "candidate").length}`}
          tone="success"
        />
        <StatCard
          label="平均得分"
          value={avg != null ? String(avg) : "—"}
          hint={scored.length ? `/ 100 · 最近 ${Math.min(scored.length, 5)} 次` : "完成一场面试后显示"}
          tone="primary"
        />
        <StatCard
          label="最高得分"
          value={best?.overall_score != null ? String(best.overall_score) : "—"}
          hint={best?.resume_title ?? "暂无成绩"}
          tone="muted"
        />
        <StatCard
          label="简历素材库"
          value={String(resumes.data?.length ?? 0)}
          hint={`目标岗位 ${jds.data?.length ?? 0} 个`}
          tone="warning"
        />
      </section>

      {/* 最近面试 + 得分趋势（demo: section-grid 1.35fr/.9fr） */}
      <section className="grid gap-4 lg:grid-cols-[1.35fr_.9fr]">
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">最近的面试</h3>
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link to="/interviews">查看全部 →</Link>
              </Button>
            </div>
            {list.length === 0 ? (
              <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                还没有面试记录，从「开始面试」发起第一场吧。
              </div>
            ) : (
              <ul className="grid gap-2.5">
                {list.slice(0, 4).map((r) => (
                  <RecentRow key={r.id} record={r} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">得分趋势</h3>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
                最近 {Math.min(scored.length, 7)} 次
              </span>
            </div>
            {scored.length === 0 ? (
              <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                暂无已评分的面试。
              </div>
            ) : (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scored.slice(-7).map((r, i) => ({ name: `#${i + 1}`, score: r.overall_score ?? 0 }))}>
                    <Tooltip
                      cursor={{ fill: "var(--accent)" }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                      formatter={(v) => [`${v} 分`, null]}
                      labelFormatter={() => ""}
                    />
                    <Bar dataKey="score" fill="var(--primary)" radius={[7, 7, 3, 3]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "success" | "warning" | "muted";
}) {
  return (
    <div className="shadow-card rounded-2xl border bg-card p-5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="my-1.5 block text-3xl tracking-tight">{value}</strong>
      {hint && (
        <small
          className={cn(
            "block truncate text-[11px]",
            tone === "success" && "font-semibold text-success",
            tone === "primary" && "font-semibold text-primary",
            tone === "warning" && "text-muted-foreground",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {hint}
        </small>
      )}
    </div>
  );
}

function RecentRow({ record: r }: { record: InterviewRecord }) {
  return (
    <li>
      <Link
        to={r.role === "interviewer" ? `/interviews/${r.id}` : `/candidate/sessions/${r.id}`}
        className="hover:bg-accent/50 flex items-center gap-3 rounded-xl border p-3 transition-colors"
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            r.role === "interviewer" ? "bg-accent text-primary" : "bg-success-soft text-success-foreground",
          )}
        >
          {r.role === "interviewer" ? <Bot className="size-5" /> : <SquareUser className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium">
            {r.role === "interviewer"
              ? `${r.resume_title ?? "未关联简历"}${r.jd_title ? ` · ${r.jd_title}` : ""}`
              : "AI 求职者练习"}
          </h4>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {new Date(r.created_at).toLocaleString("zh-CN", { hour12: false })} ·{" "}
            {r.role === "interviewer" ? "AI 面试官" : "AI 求职者"} · {r.question_count} 题 ·{" "}
            {r.status === "completed" ? "已完成" : r.status === "in_progress" ? "进行中" : "已结束"}
          </p>
        </div>
        {r.overall_score != null ? (
          <span className="text-lg font-bold">{r.overall_score}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {r.status === "in_progress" ? "进行中" : r.role === "interviewer" ? "报告中" : "—"}
          </span>
        )}
      </Link>
    </li>
  );
}

function FeaturePill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-primary shadow-sm">
      {children}
    </span>
  );
}
