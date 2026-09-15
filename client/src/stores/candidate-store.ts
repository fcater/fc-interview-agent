/**
 * 求职者会话进行态（M6）：与 interview-store 同范式、独立实例（两条循环不掺逻辑）。
 *
 * 消息流由两类来源归约而成：
 * - 快照恢复（init）：qa_history 重建问答历史（点评以落库文本还原）；
 * - SSE 事件（applyEvent）：token 流式缓冲、phase（answered/critiqued）、done 收尾。
 */

import { create } from 'zustand'
import type { AnswerCritique, CandidateSnapshotResponse, CandidateStreamEvent } from '@/lib/api'

export type CandidateMessage =
  | { role: 'user'; content: string; questionIndex: number }
  | {
      role: 'assistant'
      kind: 'answer'
      content: string
      questionIndex: number
      usedPreset: boolean
    }
  | {
      role: 'assistant'
      kind: 'critique'
      questionIndex: number
      /** 快照恢复为落库文本；实时点评额外携带结构化数据（分节渲染） */
      text: string
      structured?: AnswerCritique
    }

type CandidateStatus = 'in_progress' | 'completed' | 'aborted'

interface CandidateState {
  sessionId: number
  messages: CandidateMessage[]
  /** 流式缓冲：AI 回答 token 追加，answered 事件落为正式消息 */
  streamingText: string
  status: CandidateStatus
  questionIndex: number
  questionCount: number
  /** 已有完整问答（可请求点评）；点评对象为最近一轮回答 */
  canCritique: boolean
  /** 快照判定：需开初始化流（图初始化或作答断连恢复） */
  needsStream: boolean
  /** SSE 连接中（禁止重复提问/点评/结束） */
  streaming: boolean
  error: string | null

  init: (sessionId: number, snapshot: CandidateSnapshotResponse) => void
  applyEvent: (event: CandidateStreamEvent) => void
  setStreaming: (streaming: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const emptyState = {
  sessionId: 0,
  messages: [] as CandidateMessage[],
  streamingText: '',
  status: 'in_progress' as CandidateStatus,
  questionIndex: 0,
  questionCount: 0,
  canCritique: false,
  needsStream: false,
  streaming: false,
  error: null,
}

/** 结构化点评 → 展示文本（与后端落库格式一致：【优点】…分节） */
export function formatCritique(c: AnswerCritique): string {
  const section = (label: string, items: string[]) =>
    items.length > 0 ? `【${label}】${items.join('；')}` : ''
  return [
    section('优点', c.strengths ?? []),
    section('不足', c.weaknesses ?? []),
    section('改进建议', c.suggestions ?? []),
  ]
    .filter(Boolean)
    .join('\n')
}

export const useCandidateStore = create<CandidateState>((set) => ({
  ...emptyState,

  init: (sessionId, snapshot) =>
    set(() => {
      const messages: CandidateMessage[] = []
      for (const qa of snapshot.qa_history ?? []) {
        messages.push({ role: 'user', content: qa.question, questionIndex: qa.question_index })
        if (qa.answer !== null && qa.answer !== undefined) {
          // 快照无法还原 used_preset（未落库）：历史回答不显示命中徽标
          messages.push({
            role: 'assistant',
            kind: 'answer',
            content: qa.answer,
            questionIndex: qa.question_index,
            usedPreset: false,
          })
        }
        if (qa.assessment) {
          messages.push({ role: 'assistant', kind: 'critique', questionIndex: qa.question_index, text: qa.assessment })
        }
      }
      const questionCount = snapshot.question_count
      const lastAnsweredIdx = messages.findLastIndex((m) => m.role === 'assistant' && m.kind === 'answer')

      return {
        sessionId,
        messages,
        streamingText: '',
        status: snapshot.session.status as CandidateStatus,
        questionIndex: messages.findLast((m) => m.role === 'user')?.questionIndex ?? 0,
        questionCount,
        // 至少有一轮完整问答才可点评（点评对象为最近一次回答）
        canCritique: snapshot.session.status === 'in_progress' && lastAnsweredIdx >= 0,
        needsStream: snapshot.needs_stream,
        streaming: false,
        error: null,
      }
    }),

  applyEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case 'token':
          return { ...state, streamingText: state.streamingText + event.content, error: null }

        case 'phase': {
          if (event.phase === 'answered') {
            // 流式缓冲 → 规范回答消息（携带命中预设徽标）
            const messages: CandidateMessage[] = [
              ...state.messages,
              {
                role: 'assistant',
                kind: 'answer',
                content: event.answer ?? state.streamingText,
                questionIndex: event.question_index,
                usedPreset: event.used_preset === true,
              },
            ]
            return {
              ...state,
              messages,
              streamingText: '',
              questionIndex: event.question_index,
              questionCount: Math.max(state.questionCount, event.question_index),
              canCritique: true,
            }
          }
          // critiqued：追加结构化点评气泡（回答已在提交时落定）
          if (event.critique) {
            const messages: CandidateMessage[] = [
              ...state.messages,
              {
                role: 'assistant',
                kind: 'critique',
                questionIndex: event.question_index,
                text: formatCritique(event.critique),
                structured: event.critique,
              },
            ]
            return { ...state, messages }
          }
          return state
        }

        case 'done':
          return {
            ...state,
            streamingText: '',
            status: event.status as CandidateStatus,
            questionCount: event.question_count,
            canCritique:
              event.status === 'in_progress' &&
              (state.canCritique || state.messages.some((m) => m.role === 'assistant' && m.kind === 'answer')),
            streaming: false,
          }

        case 'error':
          return { ...state, error: event.message, streaming: false }
      }
    }),

  setStreaming: (streaming) => set({ streaming }),
  setError: (error) => set({ error }),
  reset: () => set({ ...emptyState }),
}))
