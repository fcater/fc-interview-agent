/**
 * 会话页聊天 UI 复用件（面试官页 / 求职者页共用）：
 * ChatBubble 气泡、ChatMeta 元信息行、SoftBadge 软色徽章、
 * SessionProgress 顶部进度条、Composer 底部输入区。仅视觉，不含业务状态。
 */

import type { ReactNode } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** 气泡：AI 白底描边（左），用户品牌渐变（右） */
export function ChatBubble({
  side,
  children,
  className,
}: {
  side: 'left' | 'right'
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'max-w-[85%] px-4 py-3 text-sm leading-relaxed shadow-sm',
        side === 'right'
          ? 'bg-brand-gradient rounded-2xl rounded-br-sm text-primary-foreground'
          : 'rounded-2xl rounded-tl-sm border bg-card',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** 气泡上方元信息行（题号 / 模式徽章 / 角色名等） */
export function ChatMeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
      {children}
    </div>
  )
}

/** 软色徽章：primary（默认）/ success / muted，用于题类型、预设命中等标记 */
export function SoftBadge({
  children,
  tone = 'primary',
  className,
}: {
  children: ReactNode
  tone?: 'primary' | 'success' | 'muted'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'primary' && 'bg-accent text-primary',
        tone === 'success' && 'bg-success-soft text-success-foreground',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** 会话顶部进度条：questionIndex / maxQuestions */
export function SessionProgress({
  current,
  max,
  suffix = '题',
  className,
}: {
  current: number
  max: number
  suffix?: string
  className?: string
}) {
  const pct = Math.min(100, Math.round(((current - 1) / Math.max(max, 1)) * 100))
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="shrink-0 text-xs text-muted-foreground">
        第 <span className="font-semibold text-foreground">{current}</span> / {max} {suffix}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="bg-brand-gradient h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** 底部输入区：无边框文本域内嵌白色圆角容器 + 发送按钮（Enter 发送由页面处理） */
export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  sendDisabled,
  tip,
  actions,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  disabled?: boolean
  sendDisabled?: boolean
  tip?: string
  /** 发送按钮左侧的额外操作（如「请求点评」） */
  actions?: ReactNode
}) {
  return (
    <div className="rounded-2xl border bg-card p-2 shadow-card">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-2 px-1.5">
        <span className="text-[11px] text-muted-foreground">{tip ?? 'Enter 发送 · Shift+Enter 换行'}</span>
        <div className="flex items-center gap-2">
          {actions}
          <Button
            size="icon"
            className="shrink-0"
            disabled={sendDisabled}
            onClick={onSubmit}
          >
            <Send className="size-4" />
            <span className="sr-only">发送</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
