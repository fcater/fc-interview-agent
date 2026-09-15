/**
 * 预设标准答案管理（M6，E6）：Dialog 内列表 + 新建/编辑/删除。
 * 标签为适用范围提示（命中判定「任一标签为提问文本子串」），逗号分隔输入。
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookMarked, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { presetApi, type PresetBrief } from '@/lib/api'

/** 预设管理入口按钮 + Dialog（挂在求职者会话页顶栏） */
export function PresetManager() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <BookMarked />
          预设答案
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>预设标准答案</DialogTitle>
          <DialogDescription>
            提问命中预设时 AI 优先按标准答案作答（标签 + 相似度双重匹配）。
          </DialogDescription>
        </DialogHeader>
        <PresetManagerBody />
      </DialogContent>
    </Dialog>
  )
}

function PresetManagerBody() {
  const queryClient = useQueryClient()
  const presets = useQuery({ queryKey: ['presets'], queryFn: presetApi.list })

  /** 编辑中的预设（null = 表单用于新建；undefined = 表单收起） */
  const [editing, setEditing] = useState<PresetBrief | null | undefined>(undefined)

  const remove = useMutation({
    mutationFn: presetApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presets'] })
      if (editing) setEditing(undefined)
    },
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {editing !== undefined && (
        <PresetForm
          preset={editing}
          onDone={() => setEditing(undefined)}
        />
      )}

      {editing === undefined && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          新建预设
        </Button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
        {presets.isPending && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 加载中…
          </p>
        )}
        {presets.isError && <p className="p-4 text-sm text-destructive">{presets.error.message}</p>}
        {presets.data && presets.data.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            还没有预设答案。把高频问题与你的标准答案存到这里，练习时 AI 会优先采用。
          </p>
        )}
        <ul className="divide-y">
          {presets.data?.map((p) => (
            <li key={p.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.question}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.answer}</p>
                {p.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(p)}>
                  <Pencil />
                  <span className="sr-only">编辑</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`确定删除预设「${p.question}」吗？`)) remove.mutate(p.id)
                  }}
                >
                  <Trash2 />
                  <span className="sr-only">删除</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {remove.isError && <p className="text-sm text-destructive">{remove.error.message}</p>}
    </div>
  )
}

/** 新建/编辑表单（preset=null 为新建） */
function PresetForm({ preset, onDone }: { preset: PresetBrief | null; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [question, setQuestion] = useState(preset?.question ?? '')
  const [answer, setAnswer] = useState(preset?.answer ?? '')
  const [tags, setTags] = useState(preset?.tags.join('，') ?? '')

  const save = useMutation({
    mutationFn: (payload: { question: string; answer: string; tags: string[] }) =>
      preset ? presetApi.update(preset.id, payload) : presetApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presets'] })
      onDone()
    },
  })

  const submit = () => {
    if (!question.trim() || !answer.trim()) return
    save.mutate({
      question: question.trim(),
      answer: answer.trim(),
      tags: tags
        .split(/[，,]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
    })
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="preset-question">预设问题</Label>
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
        <p className="text-xs text-muted-foreground">
          提问包含任一标签才可能命中，避免相似问题误匹配。
        </p>
      </div>
      {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          取消
        </Button>
        <Button size="sm" disabled={save.isPending || !question.trim() || !answer.trim()} onClick={submit}>
          {save.isPending && <Loader2 className="animate-spin" />}
          保存
        </Button>
      </div>
    </div>
  )
}
