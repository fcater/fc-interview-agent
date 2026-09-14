import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Send } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, interviewApi, streamSSE } from '@/lib/api'
import { cn } from '@/lib/utils'
import { questionTypeLabel, useInterviewStore } from '@/stores/interview-store'

const QUESTION_TYPE_BADGE: Record<string, string> = {
  basic: '基础',
  project: '项目',
  deep_dive: '深挖',
}

/** 面试会话页：流式问答闭环（roadmap M4 任务 8） */
export function InterviewPage() {
  const { id } = useParams()
  const sessionId = Number(id)
  const store = useInterviewStore()
  const queryClient = useQueryClient()

  const [answer, setAnswer] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  /** 防止快照加载前误开流式 */
  const [ready, setReady] = useState(false)

  // ── 快照恢复：刷新/重连后重建视图（roadmap 验收：中途刷新可续接）──
  useEffect(() => {
    store.reset()
    interviewApi
      .snapshot(sessionId)
      .then((snapshot) => {
        store.init(sessionId, snapshot)
        setReady(true)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) store.setError(err.message)
        else store.setError('加载面试会话失败')
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

  /** 打开流式端点（首题生成 / 提交回答 / 提前结束共用） */
  const openStream = useCallback(
    async (kind: 'start' | 'answer' | 'finish', content?: string) => {
      const controller = new AbortController()
      abortRef.current = controller
      store.setStreaming(true)
      try {
        await streamSSE(
          `/interviews/${sessionId}/${kind === 'start' ? 'stream' : kind === 'answer' ? 'answers' : 'finish'}`,
          kind === 'answer' ? { content } : undefined,
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
        // 会话结束：失效首页会话相关缓存（M5 记录列表将复用）
        void queryClient.invalidateQueries({ queryKey: ['interviews'] })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId],
  )

  // 首题生成：快照判定需要开流（新会话或生成中断——messages 为空即无历史可恢复）
  useEffect(() => {
    if (!ready) return
    if (store.status === 'in_progress' && store.messages.length === 0 && !store.streaming) {
      void openStream('start')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const submitAnswer = () => {
    const content = answer.trim()
    if (!content || store.streaming || !store.awaitingAnswer) return
    // 乐观插入用户回答气泡，待 assessed/下一题事件接续
    useInterviewStore.setState((s) => ({
      messages: [...s.messages, { role: 'user', content }],
      awaitingAnswer: false,
    }))
    setAnswer('')
    void openStream('answer', content)
  }

  const finishInterview = () => {
    if (store.streaming || store.status !== 'in_progress') return
    abortRef.current?.abort()
    void openStream('finish')
  }

  const finished = store.status !== 'in_progress'

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col gap-4">
      {/* 顶栏：进度 + 提前结束 */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {store.status === 'in_progress' ? (
            <>
              第 <span className="font-medium text-foreground">{store.questionIndex}</span> /
              {store.maxQuestions} 题
              {store.followUpRound > 0 && <> · 追问 {store.followUpRound} 轮</>}
            </>
          ) : (
            <span className="font-medium text-foreground">
              {store.status === 'completed' ? '面试已完成' : '面试已提前结束'}
            </span>
          )}
        </div>
        {store.status === 'in_progress' && (
          <Button size="sm" variant="outline" disabled={store.streaming} onClick={finishInterview}>
            提前结束
          </Button>
        )}
      </div>

      {/* 消息区 */}
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {store.messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {store.streamingText && (
            <MessageBubble
              message={{ role: 'assistant', kind: 'question', content: store.streamingText, questionIndex: 0, followUpRound: 0 }}
              streaming
            />
          )}
          {store.streaming && !store.streamingText && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {store.awaitingAnswer === false && store.messages.length > 0
                ? '面试官评估中…'
                : '面试官思考中…'}
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      {/* 错误 / 断线重连提示 */}
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

      {/* 回答输入区 */}
      <div className="flex items-end gap-2">
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submitAnswer()
            }
          }}
          placeholder={
            finished
              ? '面试已结束'
              : store.awaitingAnswer
                ? '输入你的回答…（Enter 发送，Shift+Enter 换行）'
                : '等待面试官…'
          }
          disabled={finished || store.streaming || !store.awaitingAnswer}
          className="min-h-20 resize-none"
        />
        <Button
          size="icon"
          className="size-10 shrink-0"
          disabled={finished || store.streaming || !store.awaitingAnswer || !answer.trim()}
          onClick={submitAnswer}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  streaming = false,
}: {
  message: {
    role: 'assistant' | 'user'
    kind?: 'question' | 'assessment' | 'summary'
    content: string
    questionIndex?: number
    followUpRound?: number
    questionType?: string | null
  }
  streaming?: boolean
}) {
  const isUser = message.role === 'user'
  const kind = message.kind ?? (isUser ? undefined : 'question')
  const isAssessment = kind === 'assessment'
  const isSummary = kind === 'summary'

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      {!isUser && kind === 'question' && !!message.questionIndex && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {message.followUpRound ? '追问' : `第 ${message.questionIndex} 题`}
          </span>
          {message.questionType && !message.followUpRound && (
            <span className="rounded bg-muted px-1.5 py-0.5">
              {QUESTION_TYPE_BADGE[message.questionType] ?? questionTypeLabel(message.questionType)}
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed',
          isUser && 'bg-primary text-primary-foreground',
          !isUser && isAssessment && 'border border-dashed bg-muted/40 italic',
          !isUser && !isAssessment && !isSummary && 'bg-muted',
          isSummary && 'bg-card border',
          streaming && 'opacity-80',
        )}
      >
        {/* AI 输出均为 Markdown（问题/评估/总结）；用户回答纯文本 */}
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </div>
    </div>
  )
}

/** Markdown 渲染（AI 输出均为 Markdown，react-markdown 默认转义防注入） */
function MarkdownContent({ content }: { content: string }) {
  return <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
}
