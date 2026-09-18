/**
 * 面试记录页（M5）：搜索 + 模式筛选 + 会话列表（评分 / 行内操作按钮），
 * 内容分布对照原型 demo history 页。数据按用户隔离（后端 E7）。
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Bot, Loader2, Plus, Search, SquareUser } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { interviewApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLlmReady } from "@/hooks/use-health";

type InterviewRecord = Awaited<ReturnType<typeof interviewApi.list>>[number];

/** 历史面试列表：按时间倒序，行内提供查看报告 / 继续会话入口 */
export function InterviewsPage() {
  const records = useQuery({ queryKey: ["interviews"], queryFn: interviewApi.list });
  const llmReady = useLlmReady();
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "interviewer" | "candidate">("all");

  const filtered = (records.data ?? []).filter((r) => {
    if (roleFilter !== "all" && r.role !== roleFilter) return false;
    if (!keyword.trim()) return true;
    const kw = keyword.trim().toLowerCase();
    return `${r.resume_title ?? ""}${r.jd_title ?? ""}`.toLowerCase().includes(kw);
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="面试记录"
        description="查看所有历史面试与评分结果。"
        character={6}
        actions={
          <Button asChild aria-disabled={!llmReady} className={cn(!llmReady && "pointer-events-none opacity-50")}>
            <Link to="/start">
              <Plus />
              新建面试
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-5">
          {/* 筛选工具条（demo toolbar：搜索 + 模式下拉） */}
          <div className="mb-4 flex flex-col sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                className="pl-9"
                placeholder="搜索岗位 / 简历"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Select
              className="sm:w-40"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            >
              <option value="all">全部模式</option>
              <option value="interviewer">AI 面试官</option>
              <option value="candidate">AI 求职者</option>
            </Select>
          </div>

          {records.isPending && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </p>
          )}
          {records.isError && <p className="py-6 text-sm text-destructive">{records.error.message}</p>}
          {records.data && filtered.length === 0 && (
            <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
              {records.data.length === 0 ? "还没有面试记录，从「开始面试」发起第一场吧。" : "没有匹配的记录。"}
            </p>
          )}

          <ul className="grid gap-2.5">
            {filtered.map((r) => (
              <SessionRow key={r.id} record={r} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SessionRow({ record: r }: { record: InterviewRecord }) {
  const llmReady = useLlmReady();
  const link = r.role === "interviewer" ? `/interviews/${r.id}` : `/candidate/sessions/${r.id}`;
  // 仅「继续会话 / 继续练习」（in_progress）依赖 LLM；查看报告只读不禁用
  const needsLlm = r.status === "in_progress";
  return (
    <li className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/40">
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
          {r.role === "interviewer" ? "AI 面试官" : "AI 求职者"} · {r.question_count} 题
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {r.role === "interviewer" && r.overall_score != null && (
          <span className={cn("text-lg font-bold", r.overall_score >= 80 ? "text-success" : "text-warning-foreground")}>
            {r.overall_score}
          </span>
        )}
        {r.role === "interviewer" && r.status === "completed" && r.overall_score == null && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            报告中
          </span>
        )}
        <Button
          asChild
          size="sm"
          variant="outline"
          aria-disabled={!llmReady && needsLlm}
          className={cn(!llmReady && needsLlm && "pointer-events-none opacity-50")}
        >
          <Link to={link}>
            {r.status === "in_progress" ? "继续会话" : r.role === "interviewer" ? "查看报告" : "继续练习"}
          </Link>
        </Button>
      </div>
    </li>
  );
}
