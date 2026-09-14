/**
 * 面试会话进行态（tech-stack §3：Zustand 管面试会话进行态）。
 *
 * 消息流由两类来源归约而成：
 * - 快照恢复（applySnapshot）：qa_history 重建完整历史，用于刷新/重连；
 * - SSE 事件（applyEvent）：token 流式缓冲、phase 阶段流转、done 收尾。
 */

import { create } from 'zustand'
import type { InterviewSnapshotResponse, InterviewStreamEvent } from '@/lib/api'

export type ChatMessage =
  | { role: 'assistant'; kind: 'question'; content: string; questionIndex: number; followUpRound: number; questionType?: string | null }
  | { role: 'assistant'; kind: 'assessment'; content: string }
  | { role: 'assistant'; kind: 'summary'; content: string }
  | { role: 'user'; content: string }

type InterviewStatus = 'in_progress' | 'completed' | 'aborted'

interface InterviewState {
  sessionId: number
  messages: ChatMessage[]
  /** 流式缓冲：token 追加，phase/done 事件时落为正式消息 */
  streamingText: string
  status: InterviewStatus
  questionIndex: number
  followUpRound: number
  maxQuestions: number
  /** 存在待回答问题（最后一条 question 消息尚无对应回答） */
  awaitingAnswer: boolean
  /** SSE 连接中（禁止重复提交与编辑） */
  streaming: boolean
  summary: string | null
  error: string | null

  init: (sessionId: number, snapshot: InterviewSnapshotResponse) => void
  applyEvent: (event: InterviewStreamEvent) => void
  setStreaming: (streaming: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const emptyState = {
  sessionId: 0,
  messages: [] as ChatMessage[],
  streamingText: '',
  status: 'in_progress' as InterviewStatus,
  questionIndex: 0,
  followUpRound: 0,
  maxQuestions: 8,
  awaitingAnswer: false,
  streaming: false,
  summary: null,
  error: null,
}

function questionTypeLabel(t?: string | null): string {
  switch (t) {
    case 'project':
      return '项目'
    case 'deep_dive':
      return '深挖'
    default:
      return '基础'
  }
}

export const useInterviewStore = create<InterviewState>((set) => ({
  ...emptyState,

  init: (sessionId, snapshot) =>
    set(() => {
      const messages: ChatMessage[] = []
      for (const qa of snapshot.qa_history ?? []) {
        messages.push({
          role: 'assistant',
          kind: 'question',
          content: qa.question,
          questionIndex: qa.question_index,
          followUpRound: qa.follow_up_round,
          questionType: qa.question_type,
        })
        if (qa.answer !== null && qa.answer !== undefined) {
          messages.push({ role: 'user', content: qa.answer })
        }
        if (qa.assessment) {
          messages.push({ role: 'assistant', kind: 'assessment', content: qa.assessment })
        }
      }
      if (snapshot.summary) {
        messages.push({ role: 'assistant', kind: 'summary', content: snapshot.summary })
      }
      // 待回答判定：最后一条问题消息没有紧跟用户回答（快照流式中断时同样成立）
      const lastQuestionIdx = messages.findLastIndex((m) => m.role === 'assistant' && m.kind === 'question')
      const answered =
        lastQuestionIdx >= 0 &&
        messages.slice(lastQuestionIdx + 1).some((m) => m.role === 'user')
      const awaitingAnswer =
        snapshot.session.status === 'in_progress' &&
        !snapshot.needs_stream &&
        lastQuestionIdx >= 0 &&
        !answered

      return {
        sessionId,
        messages,
        streamingText: '',
        status: snapshot.session.status as InterviewStatus,
        questionIndex: snapshot.question_index,
        followUpRound: snapshot.follow_up_round,
        maxQuestions: snapshot.max_questions,
        awaitingAnswer,
        streaming: false,
        summary: snapshot.summary,
        error: null,
      }
    }),

  applyEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case 'token':
          // 流式文本：追加缓冲（判答节点不产生 token 事件，后端已过滤）
          return { ...state, streamingText: state.streamingText + event.content, error: null }

        case 'phase': {
          const messages = [...state.messages]
          if (event.phase === 'awaiting_answer') {
            // 流式缓冲即本题文本 → 落为规范问题消息（无缓冲时为快照兜底场景）
            messages.push({
              role: 'assistant',
              kind: 'question',
              content: event.question ?? state.streamingText,
              questionIndex: event.question_index,
              followUpRound: event.follow_up_round,
              questionType: event.question_type,
            })
            return {
              ...state,
              messages,
              streamingText: '',
              questionIndex: event.question_index,
              followUpRound: event.follow_up_round,
              awaitingAnswer: true,
            }
          }
          // assessed：追加评估气泡；回答已在提交时由乐观插入落定
          if (event.assessment) {
            messages.push({ role: 'assistant', kind: 'assessment', content: event.assessment })
          }
          return {
            ...state,
            messages,
            followUpRound: event.follow_up_round,
            awaitingAnswer: false,
          }
        }

        case 'done': {
          const messages = [...state.messages]
          let summary = state.summary
          if (event.summary) {
            summary = event.summary
            messages.push({ role: 'assistant', kind: 'summary', content: event.summary })
          }
          return {
            ...state,
            messages,
            streamingText: '',
            status: event.status as InterviewStatus,
            summary,
            awaitingAnswer: event.status === 'in_progress' && state.awaitingAnswer,
            streaming: false,
          }
        }

        case 'error':
          return { ...state, error: event.message, streaming: false }
      }
    }),

  setStreaming: (streaming) => set({ streaming }),
  setError: (error) => set({ error }),
  reset: () => set({ ...emptyState }),
}))

export { questionTypeLabel }
