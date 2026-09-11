/**
 * 简历管理页：上传 Markdown 简历（服务端解析 + 脱敏后入库）、
 * 列表、详情（Markdown 渲染）、删除。数据按用户隔离。
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { resumeApi, type ResumeDetail } from '@/lib/api'

/** 简历管理：上传表单 + 我的简历列表/详情 */
export function ResumesPage() {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const resumes = useQuery({ queryKey: ['resumes'], queryFn: resumeApi.list })
  const detail = useQuery({
    queryKey: ['resumes', selectedId],
    queryFn: () => resumeApi.get(selectedId!),
    enabled: selectedId !== null,
  })

  const upload = useMutation({
    mutationFn: resumeApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
      setSelectedId(data.id)
      setTitle('')
      setContent('')
    },
  })

  const remove = useMutation({
    mutationFn: resumeApi.remove,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
      if (selectedId === id) setSelectedId(null)
    },
  })

  const submit = () => {
    if (!content.trim()) return
    upload.mutate({ title: title.trim(), content, format: 'markdown' })
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">简历管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传 Markdown 简历；入库前会自动脱敏手机号与邮箱。标题留空时取正文首个一级标题。
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>上传简历</CardTitle>
          <CardDescription>支持 Markdown 格式（其他格式解析器后续扩展）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              placeholder={'# 张三的后端简历\n\n## 技能\n- Python / FastAPI …'}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {upload.isError && <p className="text-sm text-destructive">{upload.error.message}</p>}
          <Button onClick={submit} disabled={upload.isPending || !content.trim()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            上传并解析
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>我的简历</CardTitle>
          <CardDescription>仅自己可见；删除后不可恢复</CardDescription>
        </CardHeader>
        <CardContent>
          {resumes.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </p>
          )}
          {resumes.isError && <p className="text-sm text-destructive">{resumes.error.message}</p>}
          {resumes.data && resumes.data.length === 0 && (
            <p className="text-sm text-muted-foreground">还没有简历，先上传一份吧。</p>
          )}
          <ul className="divide-y">
            {resumes.data?.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  className="flex-1 truncate text-left text-sm hover:underline"
                  onClick={() => setSelectedId(r.id)}
                >
                  {r.title}
                </button>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(r.updated_at).toLocaleString('zh-CN', { hour12: false })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`确定删除「${r.title}」吗？`)) remove.mutate(r.id)
                  }}
                >
                  <Trash2 />
                  删除
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {detail.data && <ResumeViewer resume={detail.data} />}
    </div>
  )
}

/** 简历详情：脱敏后的 Markdown 渲染 */
function ResumeViewer({ resume }: { resume: ResumeDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{resume.title}</CardTitle>
        <CardDescription>入库内容（手机号 / 邮箱已脱敏）</CardDescription>
      </CardHeader>
      <CardContent className="prose prose-sm max-w-none">
        <Markdown remarkPlugins={[remarkGfm]}>{resume.content}</Markdown>
      </CardContent>
    </Card>
  )
}
