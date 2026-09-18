/**
 * JD 管理页：工具栏 + JD 卡片网格（对照原型 demo 资源卡片模式），
 * 新建（AI 提取关键点预览）与详情（六字段关键点）通过 Dialog 完成。数据按用户隔离（后端 E7）。
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { jdApi, type JDBrief, type JDKeyPoints } from "@/lib/api";
import { useLlmReady } from "@/hooks/use-health";

/** JD 管理：新建（提取预览）+ 卡片网格 + 详情关键点展示 */
export function JdsPage() {
  const queryClient = useQueryClient();
  const llmReady = useLlmReady();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [keyPoints, setKeyPoints] = useState<JDKeyPoints | null>(null);

  const jds = useQuery({ queryKey: ["jds"], queryFn: jdApi.list });

  const extract = useMutation({
    mutationFn: () => jdApi.extract(content),
    onSuccess: (data) => setKeyPoints(data.key_points),
  });

  const save = useMutation({
    mutationFn: () => jdApi.create({ title: title.trim(), content, key_points: keyPoints ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jds"] });
      setTitle("");
      setContent("");
      setKeyPoints(null);
      setCreateOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: jdApi.remove,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["jds"] });
      if (viewId === id) setViewId(null);
    },
  });

  const filled = Boolean(title.trim() && content.trim());
  /** 详情 Dialog 数据直接取自列表（key_points 随 Brief 返回，无需单独请求） */
  const viewing = jds.data?.find((j) => j.id === viewId) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="目标岗位"
        description="保存 JD 并提取关键点，让面试问题真正针对岗位。"
        character={2}
        actions={
          <Button
            onClick={() => {
              setTitle("");
              setContent("");
              setKeyPoints(null);
              setCreateOpen(true);
            }}
          >
            <Plus />
            添加岗位 JD
          </Button>
        }
      />
      {jds.isPending && (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中…
        </p>
      )}
      {jds.isError && <p className="text-sm text-destructive">{jds.error.message}</p>}
      {jds.data && jds.data.length === 0 && (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          还没有保存的 JD，点击右上角「添加岗位 JD」粘贴第一份岗位描述。
        </p>
      )}
      {jds.data && jds.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {jds.data.map((j) => (
            <JdCard
              key={j.id}
              jd={j}
              deleting={remove.isPending}
              onOpen={() => setViewId(j.id)}
              onDelete={() => {
                if (window.confirm(`确定删除「${j.title}」吗？`)) remove.mutate(j.id);
              }}
            />
          ))}
        </div>
      )}
      {remove.isError && <p className="text-sm text-destructive">{remove.error.message}</p>}

      {/* 新建 Dialog：粘贴原文 → AI 提取预览 → 保存 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>添加岗位 JD</DialogTitle>
            <DialogDescription>粘贴 JD 原文，先提取关键点预览，确认后一并保存。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="jd-title">岗位名称</Label>
              <Input
                id="jd-title"
                placeholder="如：后端开发工程师（Python）"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jd-content">JD 原文</Label>
              <Textarea
                id="jd-content"
                className="min-h-48 text-sm"
                placeholder="粘贴岗位描述全文…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            {extract.isError && <p className="text-sm text-destructive">{extract.error.message}</p>}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!llmReady || extract.isPending || !content.trim()}
                onClick={() => extract.mutate()}
              >
                {extract.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                AI 提取关键点
              </Button>
              {/* 保存 JD 不经 LLM，LLM 不可用时仍可保存（关键点可留空后补） */}
              <Button disabled={!filled || save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="animate-spin" />}
                保存 JD
              </Button>
            </div>
            {keyPoints && (
              <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  提取结果（保存时一并入库）
                </p>
                <KeyPointsInline keyPoints={keyPoints} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 详情 Dialog：六字段关键点（数据来自列表接口） */}
      <Dialog
        open={viewId !== null}
        onOpenChange={(open) => {
          if (!open) setViewId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.title ?? "JD 详情"}</DialogTitle>
            <DialogDescription>AI 从 JD 中提取的结构化关键点</DialogDescription>
          </DialogHeader>
          {viewing?.key_points ? (
            <KeyPointsInline keyPoints={viewing.key_points as unknown as JDKeyPoints} />
          ) : (
            <p className="text-sm text-muted-foreground">该 JD 保存时未提取关键点。</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 列表接口的 key_points 为宽松对象，收敛为结构化类型 */
function toKeyPoints(raw: JDBrief["key_points"]): JDKeyPoints | null {
  return raw ? (raw as unknown as JDKeyPoints) : null;
}

/** Brief 不含 JD 原文，摘要由关键点拼装 */
function jdSummary(kp: JDKeyPoints | null): string {
  if (!kp) return "尚未提取关键点，点击「查看详情」查看说明。";
  const parts = [kp.position, ...(kp.responsibilities ?? []).slice(0, 2)].filter(Boolean);
  return parts.length > 0 ? parts.join("；") : "关键点为空，可重新提取。";
}

/** JD 卡片：标题 + 摘要 + 必备技能标签（前 5 个）+ footer 操作 */
function JdCard({
  jd,
  deleting,
  onOpen,
  onDelete,
}: {
  jd: JDBrief;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const kp = toKeyPoints(jd.key_points);
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
          <Briefcase className="size-4" />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{jd.title}</h3>
      </div>
      <p className="line-clamp-3 text-xs text-muted-foreground">{jdSummary(kp)}</p>
      {kp?.required_skills && kp.required_skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {kp.required_skills.slice(0, 5).map((skill, i) => (
            <span key={i} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {skill}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <span className="text-[11px] text-muted-foreground">
          创建于 {new Date(jd.created_at).toLocaleString("zh-CN", { hour12: false })}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onOpen}>
            查看详情 →
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={deleting} onClick={onDelete}>
            <Trash2 />
            <span className="sr-only">删除</span>
          </Button>
        </div>
      </div>
    </article>
  );
}

const FIELD_LABELS: Array<{ key: keyof JDKeyPoints; label: string }> = [
  { key: "position", label: "岗位" },
  { key: "responsibilities", label: "核心职责" },
  { key: "required_skills", label: "必备技能" },
  { key: "preferred_skills", label: "加分项" },
  { key: "experience_requirements", label: "经验要求" },
  { key: "soft_skills", label: "软技能" },
];

/** 六字段关键点渲染（新建预览与详情 Dialog 复用） */
function KeyPointsInline({ keyPoints }: { keyPoints: JDKeyPoints }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {FIELD_LABELS.map(({ key, label }) => {
        const value = keyPoints[key];
        const isEmpty = key === "position" ? !value : !value || value.length === 0;
        return (
          <div key={key} className="space-y-1">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm">
              {isEmpty ? (
                <span className="text-muted-foreground">—</span>
              ) : key === "position" ? (
                value
              ) : (
                <span className="flex flex-wrap gap-1">
                  {(value as string[]).map((item, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
