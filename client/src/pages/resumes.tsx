/**
 * 简历管理页：工具栏 + 简历卡片网格（对照原型 demo 资源卡片模式），
 * 上传与详情（Markdown 渲染）通过 Dialog 完成。数据按用户隔离（后端 E7）。
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resumeApi, type ResumeBrief } from "@/lib/api";
import { useLlmReady } from "@/hooks/use-health";

/** 简历管理：上传（Dialog）+ 卡片网格 + 详情 Markdown 渲染 */
export function ResumesPage() {
  const queryClient = useQueryClient();
  const llmReady = useLlmReady();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const resumes = useQuery({ queryKey: ["resumes"], queryFn: resumeApi.list });
  const detail = useQuery({
    queryKey: ["resumes", selectedId],
    queryFn: () => resumeApi.get(selectedId!),
    enabled: selectedId !== null,
  });

  const upload = useMutation({
    mutationFn: resumeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      setTitle("");
      setContent("");
      setUploadOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: resumeApi.remove,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      if (selectedId === id) setSelectedId(null);
    },
  });

  const submit = () => {
    if (!content.trim()) return;
    upload.mutate({ title: title.trim(), content, format: "markdown" });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="我的简历"
        description="简历会被解析、脱敏并切片向量化，作为 AI 面试的上下文。"
        character={4}
        actions={
          <Button onClick={() => setUploadOpen(true)} disabled={!llmReady}>
            <Plus />
            上传简历
          </Button>
        }
      />
      {resumes.isPending && (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 加载中…
        </p>
      )}
      {resumes.isError && <p className="text-sm text-destructive">{resumes.error.message}</p>}
      {resumes.data && resumes.data.length === 0 && (
        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          还没有简历，点击右上角「上传简历」添加第一份 Markdown 简历。
        </p>
      )}
      {resumes.data && resumes.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {resumes.data.map((r) => (
            <ResumeCard
              key={r.id}
              resume={r}
              deleting={remove.isPending}
              onOpen={() => setSelectedId(r.id)}
              onDelete={() => {
                if (window.confirm(`确定删除「${r.title}」吗？`)) remove.mutate(r.id);
              }}
            />
          ))}
        </div>
      )}
      {remove.isError && <p className="text-sm text-destructive">{remove.error.message}</p>}

      {/* 上传 Dialog：替代原页面顶部大表单卡片 */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传简历</DialogTitle>
            <DialogDescription>
              支持 Markdown 格式（其他格式解析器后续扩展），入库前自动脱敏手机号与邮箱。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resume-title">标题（可选）</Label>
              <Input
                id="resume-title"
                placeholder="如：张三-后端开发"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resume-content">简历正文（Markdown）</Label>
              <Textarea
                id="resume-content"
                className="min-h-56 font-mono text-sm"
                placeholder={"# 张三的后端简历\n\n## 技能\n- Python / FastAPI …"}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            {upload.isError && <p className="text-sm text-destructive">{upload.error.message}</p>}
            {/* 入库需向量化（embedding 走模型服务），LLM 不可用时禁用 */}
            <Button onClick={submit} disabled={!llmReady || upload.isPending || !content.trim()}>
              {upload.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              上传并解析
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 详情 Dialog：按需拉取脱敏后的全文并渲染 Markdown */}
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail.data?.title ?? "简历详情"}</DialogTitle>
            <DialogDescription>入库内容（手机号 / 邮箱已脱敏）</DialogDescription>
          </DialogHeader>
          {detail.isPending && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </p>
          )}
          {detail.isError && <p className="text-sm text-destructive">{detail.error.message}</p>}
          {detail.data && (
            <div className="prose prose-sm max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{detail.data.content}</Markdown>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 简历卡片：列表接口不含正文，摘要用固定说明，全文在详情 Dialog 查看 */
function ResumeCard({
  resume,
  deleting,
  onOpen,
  onDelete,
}: {
  resume: ResumeBrief;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
          <FileText className="size-4" />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{resume.title}</h3>
      </div>
      <p className="line-clamp-3 text-xs text-muted-foreground">
        简历正文已脱敏入库并切片向量化，点击「查看详情」阅读全文。
      </p>
      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <span className="text-[11px] text-muted-foreground">
          更新于 {new Date(resume.updated_at).toLocaleString("zh-CN", { hour12: false })}
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
