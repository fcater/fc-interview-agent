import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, BadgeCheck, Loader2, Sparkles, Square } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PresetManager } from '@/components/presets/preset-manager'
import { ChatBubble, ChatMeta, Composer, SoftBadge } from '@/components/chat/chat'
import {
  ApiError,
  candidateApi,
  candidateStreamPath,
  streamSSE,
  type AnswerCritique,
  type CandidateStreamEvent,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLlmReady } from '@/hooks/use-health'
import { useCandidateStore, type CandidateMessage } from '@/stores/candidate-store'

/** 求职者模式会话页（M6）：左练习面板 + 主聊天；点评/预设入口在输入区（对照 demo 分布） */
export function CandidatePage() {
  const { id } = useParams()
  const sessionId = Number(id)
  const store = useCandidateStore()
  const queryClient = useQueryClient()
  const llmReady = useLlmReady()

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

  // 初始化/断连恢复：快照判定需要开流（无问答历史的新会话，或作答中断线）；
  // LLM 不可用时挂起，健康检查就绪后自动开流
  useEffect(() => {
    if (!ready) return
    if (llmReady && store.status === 'in_progress' && store.needsStream && !store.streaming) {
      void openStream('start')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, llmReady])

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
  const phase = store.streaming
    ? 'AI 回答中…'
    : finished
      ? '练习已结束'
      : store.canCritique
        ? '可请求点评'
        : '等待你的提问'

  // 练习流程步骤高亮：按当前阶段推导
  const stepState = (key: 'init' | 'ask' | 'answer' | 'critique') => {
    if (finished) return 'done'
    if (store.streaming) return key === 'answer' ? 'current' : 'done'
    if (key === 'init' || key === 'ask') return 'done'
    return key === 'critique' && store.canCritique ? 'current' : 'todo'
  }

  return (
    <div className="gap-4 lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* 左侧练习面板（demo interview-side；移动端隐藏，结束按钮移到标题行） */}
      {!finished && (
        <aside className="shadow-card mb-4 hidden flex-col rounded-2xl border bg-card p-4 lg:sticky lg:top-20 lg:mb-0 lg:flex lg:max-h-[calc(100svh-6rem)]">
          <div className="rounded-xl border bg-success-soft/60 p-3.5">
            <p className="text-sm font-semibold">AI 求职者练习</p>
            <p className="mt-1 text-[11px] text-muted-foreground">基于你的简历进行回答训练</p>
          </div>
          <p className="mt-4 mb-2.5 text-xs font-bold">练习流程</p>
          <div className="grid gap-1">
            {(
              [
                ['init', '初始化上下文'],
                ['ask', '提问'],
                ['answer', 'AI 回答'],
                ['critique', '请求点评'],
              ] as const
            ).map(([key, label]) => {
              const state = stepState(key)
              return (
                <div
                  key={key}
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
                    {state === 'done' ? '✓' : key === 'ask' ? store.questionIndex || 2 : key === 'init' ? 1 : key === 'answer' ? 3 : 4}
                  </span>
                  {label}
                </div>
              )
            })}
          </div>
          <div className="mt-4 border-t pt-3.5">
            <p className="text-[10px] text-muted-foreground">当前轮次</p>
            <p className="mt-0.5 text-lg font-bold">第 {store.questionIndex} 问</p>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            你可以像真实面试官一样提问，AI 会基于简历回答；支持命中预设答案。
          </p>
          <div className="flex-1" />
          <Button
            variant="outline"
            className="border-destructive/30 bg-destructive-soft text-destructive hover:bg-destructive-soft hover:text-destructive"
            disabled={store.streaming || !llmReady}
            onClick={finishPractice}
          >
            <Square />
            结束练习
          </Button>
        </aside>
      )}

      {/* 主区：标题行 + 聊天 + 输入区；结束后追加完成卡 */}
      <div className={cn('flex min-w-0 flex-col gap-4', !finished && 'h-[calc(100svh-10rem)]')}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-lg font-semibold">{finished ? '练习完成' : 'AI 求职者'}</h2>
            <span className="bg-accent text-primary rounded-full px-2.5 py-1 text-[11px] font-bold">{phase}</span>
          </div>
          {!finished && (
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/30 bg-destructive-soft text-destructive hover:bg-destructive-soft hover:text-destructive lg:hidden"
              disabled={store.streaming || !llmReady}
              onClick={finishPractice}
            >
              <Square />
              结束练习
            </Button>
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
              <div className="flex items-center gap-2.5 px-1 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {store.messages.at(-1)?.role === 'user' ? '检索简历并组织回答中…' : '处理中…'}
              </div>
            )}
            <div ref={bottomRef} />
          </CardContent>
        </Card>

        {/* 错误提示 */}
        {store.error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{store.error}</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          </div>
        )}

        {/* 结束提示（求职者模式无评分报告） */}
        {finished && (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-semibold">练习完成</p>
              <p className="mt-1 text-sm text-muted-foreground">
                本次练习共 {store.questionCount} 问；点评已即时给出，可从面试记录页回看完整问答。
              </p>
            </CardContent>
          </Card>
        )}

        {/* 提问输入区：预设管理与点评入口在输入区（demo compose-bottom） */}
        {!finished && (
          <Composer
            value={question}
            onChange={setQuestion}
            onSubmit={askQuestion}
            placeholder="输入面试官问题…"
            disabled={store.streaming || !llmReady}
            sendDisabled={store.streaming || !question.trim() || !llmReady}
            tip="提问后可请求点评最近一次回答"
            actions={
              <>
                <PresetManager />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={store.streaming || !store.canCritique || !llmReady}
                  onClick={requestCritique}
                >
                  <Sparkles />
                  点评回答
                </Button>
              </>
            }
          />
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message, streaming = false }: { message: CandidateMessage; streaming?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <ChatBubble side="right">
          <span className="whitespace-pre-wrap">{message.content}</span>
        </ChatBubble>
      </div>
    )
  }

  if (message.kind === 'answer') {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <ChatMeta>
          <span>第 {message.questionIndex} 问</span>
          {message.usedPreset && (
            <SoftBadge tone="success">
              <BadgeCheck className="size-3" />
              预设答案
            </SoftBadge>
          )}
        </ChatMeta>
        <ChatBubble side="left" className={cn(streaming && 'opacity-80')}>
          {/* AI 输出为 Markdown（react-markdown 默认转义防注入） */}
          <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
        </ChatBubble>
      </div>
    )
  }

  // 点评：结构化三段（优点/不足/建议）；快照恢复为落库文本
  return (
    <div className="ml-6 max-w-[85%] rounded-xl border border-dashed border-primary/30 bg-accent/70 px-4 py-2.5 text-sm">
      <ChatMeta className="mb-1 text-primary">◇ 回答点评</ChatMeta>
      {message.structured ? (
        <CritiqueSections structured={message.structured} />
      ) : (
        <span className="italic whitespace-pre-wrap">{message.text}</span>
      )}
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
