/**
 * JD 管理页：粘贴 JD → AI 提取结构化关键点 → 保存；
 * 历史 JD 列表可查看 / 复用（重新提取或作为面试目标）。
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Loader2, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { jdApi, type JDKeyPoints } from '@/lib/api'

/** JD 管理录入：提取预览 + 保存 + 历史复用 */
export function JdsPage() {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [keyPoints, setKeyPoints] = useState<JDKeyPoints | null>(null)

  const jds = useQuery({ queryKey: ['jds'], queryFn: jdApi.list })

  const extract = useMutation({
    mutationFn: () => jdApi.extract(content),
    onSuccess: (data) => setKeyPoints(data.key_points),
  })

  const save = useMutation({
    mutationFn: () => jdApi.create({ title: title.trim(), content, key_points: keyPoints ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jds'] })
      setTitle('')
      setContent('')
      setKeyPoints(null)
    },
  })

  const remove = useMutation({
    mutationFn: jdApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jds'] }),
  })

  const filled = Boolean(title.trim() && content.trim())

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">JD 管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          粘贴岗位描述，AI 提取结构化关键点（岗位 / 职责 / 技术栈 / 加分项），保存后可在面试中复用。
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>录入 JD</CardTitle>
          <CardDescription>先提取预览，确认关键点后保存（保存时也可自动提取）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="jd-title">标题</Label>
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
              disabled={extract.isPending || !content.trim()}
              onClick={() => extract.mutate()}
            >
              {extract.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              AI 提取关键点
            </Button>
            <Button
              disabled={!filled || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              保存 JD
            </Button>
          </div>
        </CardContent>
      </Card>

      {keyPoints && <KeyPointsCard keyPoints={keyPoints} />}

      <Card>
        <CardHeader>
          <CardTitle>历史 JD</CardTitle>
          <CardDescription>保存过的 JD，后续面试时可直接选用</CardDescription>
        </CardHeader>
        <CardContent>
          {jds.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </p>
          )}
          {jds.isError && <p className="text-sm text-destructive">{jds.error.message}</p>}
          {jds.data && jds.data.length === 0 && (
            <p className="text-sm text-muted-foreground">还没有保存的 JD。</p>
          )}
          <ul className="divide-y">
            {jds.data?.map((j) => (
              <li key={j.id} className="py-3">
                <div className="flex items-center gap-3">
                  <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{j.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(j.created_at).toLocaleString('zh-CN', { hour12: false })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`确定删除「${j.title}」吗？`)) remove.mutate(j.id)
                    }}
                  >
                    <Trash2 />
                    删除
                  </Button>
                </div>
                {j.key_points && (
                  <KeyPointsInline keyPoints={j.key_points as unknown as JDKeyPoints} />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

const FIELD_LABELS: Array<{ key: keyof JDKeyPoints; label: string }> = [
  { key: 'position', label: '岗位' },
  { key: 'responsibilities', label: '核心职责' },
  { key: 'required_skills', label: '必备技能' },
  { key: 'preferred_skills', label: '加分项' },
  { key: 'experience_requirements', label: '经验要求' },
  { key: 'soft_skills', label: '软技能' },
]

/** 提取结果预览（保存前确认） */
function KeyPointsCard({ keyPoints }: { keyPoints: JDKeyPoints }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>提取结果</CardTitle>
        <CardDescription>AI 从 JD 中提取的结构化关键点，保存时一并入库</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <KeyPointsInline keyPoints={keyPoints} />
      </CardContent>
    </Card>
  )
}

function KeyPointsInline({ keyPoints }: { keyPoints: JDKeyPoints }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {FIELD_LABELS.map(({ key, label }) => {
        const value = keyPoints[key]
        const isEmpty = key === 'position' ? !value : !value || value.length === 0
        return (
          <div key={key} className="space-y-1">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm">
              {isEmpty ? (
                <span className="text-muted-foreground">—</span>
              ) : key === 'position' ? (
                value
              ) : (
                <span className="flex flex-wrap gap-1">
                  {(value as string[]).map((item, i) => (
                    <span
                      key={i}
                      className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </span>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
