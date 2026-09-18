/**
 * 预设答案页：工具栏 + 预设卡片网格（对照原型 demo 资源卡片模式），
 * 新建通过 Dialog 完成；删除与查询复用 preset-manager 的 API 与 queryKey。数据按用户隔离（后端 E7）。
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { presetApi, type PresetBrief } from "@/lib/api";

/** 预设答案页：新建（Dialog）+ 卡片网格（答案摘要 + 标签） */
export function PresetsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tags, setTags] = useState("");

  const presets = useQuery({ queryKey: ["presets"], queryFn: presetApi.list });

  const save = useMutation({
    mutationFn: presetApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presets"] });
      setQuestion("");
      setAnswer("");
      setTags("");
      setCreateOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: presetApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presets"] }),
  });

  /** 标签处理与 preset-manager 一致：中英文逗号分隔，去空后最多 8 个 */
  const submit = () => {
    if (!question.trim() || !answer.trim()) return;
    save.mutate({
      question: question.trim(),
      answer: answer.trim(),
      tags: tags
        .split(/[，,]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="预设答案"
        description="把真实项目经验整理成可复用答案，AI 求职者模式会自动进行标签 + 语义匹配。"
        character={3}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            新建答案
          </Button>
        }
      />
      {presets.isPending && (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中…
        </p>
      )}
      {presets.isError && <p className="text-sm text-destructive">{presets.error.message}</p>}
      {presets.data && presets.data.length === 0 && (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          还没有预设答案，点击右上角「新建答案」把高频问题与标准答案存进来。
        </p>
      )}
      {presets.data && presets.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {presets.data.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              deleting={remove.isPending}
              onDelete={() => {
                if (window.confirm(`确定删除预设「${p.question}」吗？`)) remove.mutate(p.id);
              }}
            />
          ))}
        </div>
      )}
      {remove.isError && <p className="text-sm text-destructive">{remove.error.message}</p>}

      {/* 新建 Dialog：问题 + 答案 + 标签（匹配逻辑同 preset-manager） */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建预设答案</DialogTitle>
            <DialogDescription>提问命中预设时 AI 优先按标准答案作答（标签 + 相似度双重匹配）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="preset-question">面试问题</Label>
              <Input
                id="preset-question"
                placeholder="如：介绍一下你做过的最有技术挑战的项目"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preset-answer">标准答案</Label>
              <Textarea
                id="preset-answer"
                className="min-h-28"
                placeholder="希望 AI 逐字采用的答案内容"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preset-tags">标签（逗号分隔，≤8 个）</Label>
              <Input
                id="preset-tags"
                placeholder="如：项目，挑战，亮点"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">提问包含任一标签才可能命中，避免相似问题误匹配。</p>
            </div>
            {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}
            <DialogFooter>
              <Button disabled={save.isPending || !question.trim() || !answer.trim()} onClick={submit}>
                {save.isPending && <Loader2 className="animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 预设卡片：问题为标题、答案为摘要、tags 标签行（全文不再单独做详情） */
function PresetCard({ preset, deleting, onDelete }: { preset: PresetBrief; deleting: boolean; onDelete: () => void }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
          <BookMarked className="size-4" />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{preset.question}</h3>
      </div>
      <p className="line-clamp-3 text-xs text-muted-foreground">{preset.answer}</p>
      {preset.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {preset.tags.map((t) => (
            <span key={t} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <span className="text-[11px] text-muted-foreground">
          创建于 {new Date(preset.created_at).toLocaleString("zh-CN", { hour12: false })}
        </span>
        <Button variant="ghost" size="icon-sm" disabled={deleting} onClick={onDelete}>
          <Trash2 />
          <span className="sr-only">删除</span>
        </Button>
      </div>
    </article>
  );
}
