import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ReportView } from '@/components/report/report-view'
import { ChatBubble, ChatMeta, Composer, SessionProgress, SoftBadge } from '@/components/chat/chat'
import { ApiError, interviewApi, streamSSE } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLlmReady } from '@/hooks/use-health'
import { questionTypeLabel, useInterviewStore } from '@/stores/interview-store'

const QUESTION_TYPE_BADGE: Record<string, string> = {
  basic: '基础',
  project: '项目',
  deep_dive: '深挖',
}
const TYPE_CYCLE = ['basic', 'project', 'deep_dive'] as const

/** 面试会话页：左进度面板 + 主聊天（demo 三栏壳的可用数据子集，内容分布对照原型） */
export function InterviewPage() {
  const { id } = useParams()
  const sessionId = Number(id)
  const store = useInterviewStore()
  const queryClient = useQueryClient()
  const llmReady = useLlmReady()

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
        // 会话结束：失效首页/记录页会话相关缓存
        void queryClient.invalidateQueries({ queryKey: ['interviews'] })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId],
  )

  // 首题生成：快照判定需要开流（新会话或生成中断——messages 为空即无历史可恢复）；
  // LLM 不可用时挂起，健康检查就绪后自动开流
  useEffect(() => {
    if (!ready) return
    if (llmReady && store.status === 'in_progress' && store.messages.length === 0 && !store.streaming) {
      void openStream('start')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, llmReady])

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
  const phase = store.streaming
    ? 'AI 正在分析…'
    : finished
      ? store.status === 'completed'
        ? '面试已完成'
        : '已提前结束'
      : store.awaitingAnswer
        ? '等待你的回答'
        : '处理中…'

  return (
    <div className="gap-4 lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* 左侧进度面板（demo interview-side；移动端隐藏，进度移到主区顶栏） */}
      {!finished && (
        <aside className="shadow-card mb-4 hidden flex-col rounded-2xl border bg-card p-4 lg:sticky lg:top-20 lg:mb-0 lg:flex lg:max-h-[calc(100svh-6rem)]">
          <div className="rounded-xl border bg-accent/50 p-3.5">
            <p className="text-sm font-semibold">AI 面试官</p>
            <p className="mt-1 text-[11px] text-muted-foreground">目标岗位模拟 · 动态追问</p>
          </div>
          <p className="mt-4 mb-2.5 text-xs font-bold">面试进度</p>
          <div className="grid content-start gap-1 overflow-y-auto">
            {Array.from({ length: Math.max(store.maxQuestions, store.questionIndex) }, (_, i) => {
              const n = i + 1
              const type = TYPE_CYCLE[i % TYPE_CYCLE.length]
              const state = n < store.questionIndex ? 'done' : n === store.questionIndex ? 'current' : 'todo'
              return (
                <div
                  key={n}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-1.5 py-2 text-[11px]',
                    state === 'current' && 'bg-accent font-bold text-primary',
                    state === 'done' && 'text-muted-foreground',
                    state === 'todo' && 'text-muted-foreground/70',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full font-bold',
                      state === 'current' && 'bg-primary text-primary-foreground',
                      state === 'done' && 'bg-success-soft text-success-foreground',
                      state === 'todo' && 'bg-muted',
                    )}
                  >
                    {state === 'done' ? '✓' : n}
                  </span>
                  第 {n} 题 · {QUESTION_TYPE_BADGE[type] ?? questionTypeLabel(type)}
                </div>
              )
            })}
          </div>
          <div className="mt-4 border-t pt-3.5">
            <p className="text-[10px] text-muted-foreground">当前轮次</p>
            <p className="mt-0.5 text-lg font-bold">
              {store.questionIndex} / {store.maxQuestions}
              {store.followUpRound > 0 && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  追问 {store.followUpRound} 轮
                </span>
              )}
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="outline" className="border-destructive/30 bg-destructive-soft text-destructive hover:bg-destructive-soft hover:text-destructive" disabled={store.streaming || !llmReady} onClick={finishInterview}>
            提前结束面试
          </Button>
        </aside>
      )}

      {/* 主区：标题行 + 聊天 + 输入区；结束后追加报告与逐题复盘 */}
      <div className={cn('flex min-w-0 flex-col gap-4', !finished && 'h-[calc(100svh-10rem)]')}>
        {/* 标题行：移动端含进度条与结束按钮（左面板在移动端隐藏） */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-lg font-semibold">{finished ? '面试复盘' : 'AI 面试官'}</h2>
            <span className="bg-accent text-primary rounded-full px-2.5 py-1 text-[11px] font-bold">
              {phase}
            </span>
          </div>
          {!finished && (
            <div className="flex items-center gap-3">
              <SessionProgress
                current={store.questionIndex}
                max={store.maxQuestions}
                suffix={`题${store.followUpRound > 0 ? ` · 追问 ${store.followUpRound} 轮` : ''}`}
                className="hidden sm:flex"
              />
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/30 bg-destructive-soft text-destructive hover:bg-destructive-soft hover:text-destructive lg:hidden"
                disabled={store.streaming || !llmReady}
                onClick={finishInterview}
              >
                提前结束
              </Button>
            </div>
          )}
        </div>

        {/* 消息区 */}
        <Card className={cn('flex flex-col', finished ? 'h-[55vh] shrink-0' : 'min-h-0 flex-1')}>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
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
              <ThinkingIndicator
                text={store.awaitingAnswer === false && store.messages.length > 0 ? '面试官评估中' : '面试官思考中'}
              />
            )}
            <div ref={bottomRef} />
          </CardContent>
        </Card>

        {/* 错误 / 断线重连提示 */}
        {store.error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{store.error}</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          </div>
        )}

        {/* 结束后：评分报告 + 逐题复盘；进行中该区域不存在，输入区占位 */}
        {finished ? (
          <>
            <ReportSection sessionId={sessionId} />
            <QaReview messages={store.messages} />
          </>
        ) : (
          <Composer
            value={answer}
            onChange={setAnswer}
            onSubmit={submitAnswer}
            placeholder={store.awaitingAnswer ? '输入你的回答…建议使用「背景 → 方案 → 结果」结构' : '等待面试官…'}
            disabled={store.streaming || !store.awaitingAnswer || !llmReady}
            sendDisabled={store.streaming || !store.awaitingAnswer || !answer.trim() || !llmReady}
            tip="Enter 发送 · Shift+Enter 换行"
          />
        )}
      </div>
    </div>
  )
}

/** 评分报告区（M5）：报告未生成时轮询（后台任务 30-60s），失败可手动补生成 */
function ReportSection({ sessionId }: { sessionId: number }) {
  const queryClient = useQueryClient()
  const llmReady = useLlmReady()

  const report = useQuery({
    queryKey: ['report', sessionId],
    queryFn: () => interviewApi.getReport(sessionId),
    retry: false,
    // 404（尚未生成）时每 3s 轮询直到拿到报告；其他错误不轮询
    refetchInterval: (query) => {
      const err = query.state.error
      if (query.state.data) return false
      return err instanceof ApiError && err.status === 404 ? 3000 : false
    },
  })

  // 幂等补生成：后台任务丢失/旧会话回填入口（同步等待 LLM，约 30-60s）
  const regenerate = useMutation({
    mutationFn: () => interviewApi.generateReport(sessionId),
    onSuccess: (data) => {
      queryClient.setQueryData(['report', sessionId], data)
      // 列表页"报告中"徽章已过期，刷新
      void queryClient.invalidateQueries({ queryKey: ['interviews'] })
    },
  })

  const notFound = report.error instanceof ApiError && report.error.status === 404

  return (
    <Card>
      <CardContent className="p-5">
        {report.data && <ReportView report={report.data.report} />}
        {!report.data && (report.isPending || notFound) && (
          <div className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            评分报告生成中，约需 1 分钟…
            <Button size="sm" variant="ghost" disabled={!llmReady || regenerate.isPending} onClick={() => regenerate.mutate()}>
              <RefreshCw />
              手动生成
            </Button>
          </div>
        )}
        {!report.data && report.error && !notFound && (
          <div className="space-y-2 py-2">
            <p className="text-sm text-destructive">{report.error.message}</p>
            <Button size="sm" variant="outline" onClick={() => report.refetch()}>
              重试
            </Button>
          </div>
        )}
        {regenerate.isError && <p className="mt-2 text-sm text-destructive">{regenerate.error.message}</p>}
      </CardContent>
    </Card>
  )
}

/** 逐题复盘手风琴（demo qa-list）：问题 + 该题点评，来自会话消息流 */
function QaReview({ messages }: { messages: ReturnType<typeof useInterviewStore.getState>['messages'] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  // ChatMessage 为联合类型（user 变体无 kind），先按判别字段收窄再取 questionIndex
  const pairs: Array<{ index: number; question: string; assessment: string | null }> = []
  messages.forEach((m, i) => {
    if (m.role !== 'assistant' || m.kind !== 'question' || m.followUpRound) return
    const next = messages[i + 1]
    pairs.push({
      index: m.questionIndex,
      question: m.content,
      assessment: next?.role === 'assistant' && next.kind === 'assessment' ? next.content : null,
    })
  })

  if (pairs.length === 0) return null

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-base font-semibold">逐题复盘</h3>
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
            {pairs.length} 道问题
          </span>
        </div>
        <ul className="grid gap-2">
          {pairs.map((p, i) => (
            <li key={i} className="overflow-hidden rounded-xl border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 bg-card px-3.5 py-3 text-left text-xs font-semibold text-foreground hover:bg-muted/50"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
              >
                <span className="min-w-0 flex-1 truncate">
                  Q{p.index} · {p.question.replace(/[#*\n]/g, ' ').slice(0, 60)}
                </span>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', openIdx === i && 'rotate-180')} />
              </button>
              {openIdx === i && (
                <div className="space-y-2 border-t bg-muted/30 px-3.5 py-3 text-xs leading-relaxed">
                  <Markdown remarkPlugins={[remarkGfm]}>{p.question}</Markdown>
                  {p.assessment ? (
                    <div className="text-muted-foreground">
                      <p className="text-primary mb-1 text-[11px] font-bold">AI 点评</p>
                      <Markdown remarkPlugins={[remarkGfm]}>{p.assessment}</Markdown>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">本题无点评记录</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
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

  if (isAssessment) {
    // 评估卡：虚线浅色卡，区别于普通问答气泡
    return (
      <div className="ml-6 max-w-[85%] rounded-xl border border-dashed border-primary/30 bg-accent/70 px-4 py-2.5 text-sm">
        <ChatMeta className="mb-1 text-primary">✦ AI 点评本轮回答</ChatMeta>
        <MarkdownContent content={message.content} />
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
      {!isUser && kind === 'question' && !!message.questionIndex && (
        <ChatMeta>
          <span>{message.followUpRound ? '追问' : `第 ${message.questionIndex} 题`}</span>
          {message.questionType && !message.followUpRound && (
            <SoftBadge>
              {QUESTION_TYPE_BADGE[message.questionType] ?? questionTypeLabel(message.questionType)}
            </SoftBadge>
          )}
        </ChatMeta>
      )}
      <ChatBubble
        side={isUser ? 'right' : 'left'}
        className={cn(isSummary && 'border-primary/30 bg-accent/60', streaming && 'opacity-80')}
      >
        {/* AI 输出均为 Markdown（问题/评估/总结）；用户回答纯文本 */}
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </ChatBubble>
    </div>
  )
}

/** 等待 AI 时三点跳动指示 */
function ThinkingIndicator({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 text-xs text-muted-foreground">
      <span>{text}</span>
      <span className="flex gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="bg-primary size-1.5 animate-bounce rounded-full"
            style={{ animationDelay: `${delay}ms`, animationDuration: '0.9s' }}
          />
        ))}
      </span>
    </div>
  )
}

/** Markdown 渲染（AI 输出均为 Markdown，react-markdown 默认转义防注入） */
function MarkdownContent({ content }: { content: string }) {
  return <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
}
