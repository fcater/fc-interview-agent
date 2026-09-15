import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, BadgeCheck, Loader2, Send, Sparkles, Square } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { PresetManager } from '@/components/presets/preset-manager'
import {
  ApiError,
  candidateApi,
  candidateStreamPath,
  streamSSE,
  type AnswerCritique,
  type CandidateStreamEvent,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useCandidateStore, type CandidateMessage } from '@/stores/candidate-store'

/** 求职者模式会话页（M6）：用户扮演面试官提问，AI 以简历主人口吻流式作答 */
export function CandidatePage() {
  const { id } = useParams()
  const sessionId = Number(id)
  const store = useCandidateStore()
  const queryClient = useQueryClient()

  const [question, setQuestion] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  /** 防止快照加载前误开流式 */
  const [ready, setReady] = useState(false)

  // ── 快照恢复：刷新/重连后重建视图（与面试官页同一范式）────────
  useEffect(() => {
    store.reset()
    candidateApi
      .snapshot(sessionId)
      .then((snapshot) => {
        store.init(sessionId, snapshot)
        setReady(true)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) store.setError(err.message)
        else store.setError('加载求职者会话失败')
      })
    return () => {
      abortRef.current?.abort()
      store.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ── 自动滚动到底部 ────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [store.messages, store.streamingText])

  /** 打开流式端点（初始化恢复 / 提问 / 点评 / 结束共用） */
  const openStream = useCallback(
    async (kind: 'start' | 'ask' | 'critique' | 'finish', content?: string) => {
      const controller = new AbortController()
      abortRef.current = controller
      store.setStreaming(true)
      try {
        await streamSSE<CandidateStreamEvent>(
          `/candidate/sessions/${sessionId}/${candidateStreamPath[kind]}`,
          kind === 'ask' ? { content } : undefined,
          (event) => store.applyEvent(event),
          controller.signal,
        )
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          store.setError(err instanceof ApiError ? err.message : '连接中断，请重试')
        }
      } finally {
        store.setStreaming(false)
        abortRef.current = null
        // 会话结束：失效记录列表缓存（列表页"进行中"徽章已过期）
        void queryClient.invalidateQueries({ queryKey: ['interviews'] })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId],
  )

  // 初始化/断连恢复：快照判定需要开流（无问答历史的新会话，或作答中断线）
  useEffect(() => {
    if (!ready) return
    if (store.status === 'in_progress' && store.needsStream && !store.streaming) {
      void openStream('start')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const askQuestion = () => {
    const content = question.trim()
    if (!content || store.streaming || store.status !== 'in_progress') return
    // 乐观插入提问气泡，AI 回答随流式事件接续
    useCandidateStore.setState((s) => ({
      messages: [...s.messages, { role: 'user', content, questionIndex: s.questionIndex + 1 }],
      canCritique: false,
    }))
    setQuestion('')
    void openStream('ask', content)
  }

  const requestCritique = () => {
    if (store.streaming || !store.canCritique || store.status !== 'in_progress') return
    void openStream('critique')
  }

  const finishPractice = () => {
    if (store.streaming || store.status !== 'in_progress') return
    abortRef.current?.abort()
    void openStream('finish')
  }

  const finished = store.status !== 'in_progress'

  return (
    <div
      className={cn(
        'mx-auto max-w-3xl',
        // 进行中：固定视口高度聊天布局；结束后：文档流滚动
        finished ? 'space-y-4' : 'flex h-[calc(100vh-8rem)] flex-col gap-4',
      )}
    >
      {/* 顶栏：进度 + 预设管理 + 点评 + 结束 */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {store.status === 'in_progress' ? (
            <>
              求职者模式 · 第 <span className="font-medium text-foreground">{store.questionIndex}</span> 问
            </>
          ) : (
            <span className="font-medium text-foreground">练习已结束（共 {store.questionCount} 问）</span>
          )}
        </div>
        {store.status === 'in_progress' && (
          <div className="flex items-center gap-2">
            <PresetManager />
            <Button
              size="sm"
              variant="outline"
              disabled={store.streaming || !store.canCritique}
              onClick={requestCritique}
            >
              <Sparkles />
              请求点评
            </Button>
            <Button size="sm" variant="outline" disabled={store.streaming} onClick={finishPractice}>
              <Square />
              结束练习
            </Button>
          </div>
        )}
      </div>

      {/* 消息区 */}
      <Card className={cn('flex flex-col', finished ? 'h-[55vh] shrink-0' : 'min-h-0 flex-1')}>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {store.messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {store.streamingText && (
            <MessageBubble
              message={{
                role: 'assistant',
                kind: 'answer',
                content: store.streamingText,
                questionIndex: 0,
                usedPreset: false,
              }}
              streaming
            />
          )}
          {store.streaming && !store.streamingText && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {store.messages.at(-1)?.role === 'user' ? '检索简历并组织回答中…' : '处理中…'}
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {store.error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{store.error}</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => window.location.reload()}
          >
            重新加载
          </Button>
        </div>
      )}

      {/* 结束提示（求职者模式无评分报告） */}
      {finished && (
        <Card>
          <CardHeader>
            <CardTitle>练习完成</CardTitle>
            <CardDescription>
              本次练习共 {store.questionCount} 问；点评已即时给出，可从面试记录页回看完整问答。
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* 提问输入区 */}
      {!finished && (
        <div className="flex items-end gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                askQuestion()
              }
            }}
            placeholder="以面试官身份提问…（Enter 发送，Shift+Enter 换行）"
            disabled={store.streaming}
            className="min-h-20 resize-none"
          />
          <Button
            size="icon"
            className="size-10 shrink-0"
            disabled={store.streaming || !question.trim()}
            onClick={askQuestion}
          >
            <Send className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message, streaming = false }: { message: CandidateMessage; streaming?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-lg bg-primary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.kind === 'answer') {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>第 {message.questionIndex} 问</span>
          {message.usedPreset && (
            <span className="inline-flex items-center gap-0.5 rounded bg-green-500/15 px-1.5 py-0.5 text-green-600 dark:text-green-400">
              <BadgeCheck className="size-3" />
              预设答案
            </span>
          )}
        </div>
        <div
          className={cn(
            'max-w-[85%] rounded-lg bg-muted px-4 py-2.5 text-sm leading-relaxed',
            streaming && 'opacity-80',
          )}
        >
          {/* AI 输出为 Markdown（react-markdown 默认转义防注入） */}
          <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
        </div>
      </div>
    )
  }

  // 点评：结构化三段（优点/不足/建议）；快照恢复为落库文本
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3" />
        回答点评
      </div>
      <div className="max-w-[85%] rounded-lg border border-dashed bg-muted/40 px-4 py-2.5 text-sm leading-relaxed">
        {message.structured ? (
          <CritiqueSections structured={message.structured} />
        ) : (
          <span className="italic whitespace-pre-wrap">{message.text}</span>
        )}
      </div>
    </div>
  )
}

/** 结构化点评分节渲染（E8：with_structured_output 的 AnswerCritique） */
function CritiqueSections({ structured }: { structured: AnswerCritique }) {
  const sections = [
    { label: '优点', items: structured.strengths },
    { label: '不足', items: structured.weaknesses },
    { label: '改进建议', items: structured.suggestions },
  ]
  return (
    <div className="space-y-2">
      {sections.map(
        ({ label, items }) =>
          items.length > 0 && (
            <div key={label}>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ),
      )}
    </div>
  )
}
