/**
 * API 客户端封装：fetch + JWT header 注入 + 统一错误结构解析。
 * 所有请求统一走 /api 前缀：开发环境由 Vite 代理到后端（见 vite.config.ts），
 * 生产环境由 nginx 反代（见 docs/tech-stack.md §4.5）。
 * 后端错误体为 {code, message, detail}（见 server/app/schemas/common.py）。
 */

import type { components } from '@/api/schema'

const BASE_URL = '/api'

const TOKEN_KEY = 'fc_interview_token'

/** Token 存取（登录后写入；请求侧 Authorization header 自动注入） */
export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
}

/** 统一业务错误：携带 HTTP 状态码与后端错误码（code），便于调用方分类处理（如 401 跳登录） */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    let message = `请求失败（${res.status}）`
    let code: string | undefined
    try {
      const body = (await res.json()) as { code?: string; message?: string; detail?: unknown }
      if (typeof body.message === 'string' && body.message) message = body.message
      else if (typeof body.detail === 'string') message = body.detail
      code = body.code
    } catch {
      /* 响应体非 JSON 时保留默认错误信息 */
    }
    throw new ApiError(res.status, message, code)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// ── 认证接口（类型来自 pnpm gen:api 生成的 schema.d.ts）──────────

export type UserResponse = components['schemas']['UserResponse']
export type TokenResponse = components['schemas']['TokenResponse']
export type LoginRequest = components['schemas']['LoginRequest']
export type RegisterRequest = components['schemas']['RegisterRequest']

export const authApi = {
  register: (data: RegisterRequest) => api.post<UserResponse>('/auth/register', data),
  login: (data: LoginRequest) => api.post<TokenResponse>('/auth/login', data),
  me: () => api.get<UserResponse>('/users/me'),
}

// ── 简历接口（M2）──────────────────────────────────────────────

export type ResumeBrief = components['schemas']['ResumeBrief']
export type ResumeDetail = components['schemas']['ResumeDetail']
export type ResumeCreateRequest = components['schemas']['ResumeCreateRequest']

export const resumeApi = {
  list: () => api.get<ResumeBrief[]>('/resumes'),
  get: (id: number) => api.get<ResumeDetail>(`/resumes/${id}`),
  create: (data: ResumeCreateRequest) => api.post<ResumeDetail>('/resumes', data),
  remove: (id: number) => api.delete<void>(`/resumes/${id}`),
}

// ── JD 接口（M2）───────────────────────────────────────────────

export type JDBrief = components['schemas']['JDBrief']
export type JDDetail = components['schemas']['JDDetail']
export type JDKeyPoints = components['schemas']['JDKeyPoints']

export const jdApi = {
  list: () => api.get<JDBrief[]>('/jds'),
  get: (id: number) => api.get<JDDetail>(`/jds/${id}`),
  extract: (content: string) =>
    api.post<{ key_points: JDKeyPoints }>('/jds/extract', { content }),
  create: (data: { title: string; content: string; key_points?: JDKeyPoints }) =>
    api.post<JDDetail>('/jds', data),
  remove: (id: number) => api.delete<void>(`/jds/${id}`),
}

// ── 面试接口（M4）──────────────────────────────────────────────

export type InterviewSessionBrief = components['schemas']['InterviewSessionBrief']
export type InterviewSnapshotResponse = components['schemas']['InterviewSnapshotResponse']
export type InterviewStartRequest = components['schemas']['InterviewStartRequest']

/** 面试 SSE 事件（后端 schemas/interview.py 的 TokenEvent/PhaseEvent/DoneEvent/ErrorEvent） */
export type InterviewStreamEvent =
  | { type: 'token'; content: string; node?: string | null }
  | {
      type: 'phase'
      phase: 'awaiting_answer' | 'assessed'
      question_index: number
      follow_up_round: number
      question?: string | null
      question_type?: string | null
      assessment?: string | null
      need_follow_up?: boolean | null
    }
  | { type: 'done'; status: string; question_count: number; summary?: string | null }
  | { type: 'error'; message: string }

/**
 * POST SSE 流式请求：fetch ReadableStream + 手动解析 text/event-stream。
 * EventSource 不支持自定义 Header（无法带 JWT），故手写解析（tech-stack §3）。
 * onEvent 按事件回调；中断（组件卸载/用户取消）由调用方传入 AbortSignal。
 */
export async function streamSSE(
  path: string,
  body: unknown | undefined,
  onEvent: (event: InterviewStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' })
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    let message = `请求失败（${res.status}）`
    let code: string | undefined
    try {
      const err = (await res.json()) as { code?: string; message?: string }
      if (err.message) message = err.message
      code = err.code
    } catch {
      /* 非 JSON 错误体时保留默认信息 */
    }
    throw new ApiError(res.status, message, code)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE 事件以空行分隔；JSON data 内的换行已转义，按行取 data: 即可
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data) onEvent(JSON.parse(data) as InterviewStreamEvent)
      }
    }
  }
}

export const interviewApi = {
  start: (data: InterviewStartRequest) => api.post<InterviewSessionBrief>('/interviews', data),
  snapshot: (id: number) => api.get<InterviewSnapshotResponse>(`/interviews/${id}/snapshot`),
}
