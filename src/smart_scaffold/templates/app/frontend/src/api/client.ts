/**
 * axios 封裝。所有對後端的呼叫都走這裡。
 *
 * 兩件容易做錯的事已經處理好了：
 * 1. 401 之後自動換票並重送——但**同時發生的多個 401 只會換一次票**。
 *    refresh token 是輪替的，如果每個請求各換各的，後換的會把先換的作廢，
 *    結果全員被踢出去。
 * 2. 錯誤訊息統一由 errorMessage() 取，後端的格式只在這一處解析。
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './token-storage'

export interface ApiErrorBody {
  code?: string
  message?: string
  detail?: unknown
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export const http = axios.create({ baseURL: '/api/v1', timeout: 30_000 })

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean }

let authExpiredHandler: (() => void) | null = null

/** 讓 store 掛上「被登出時該做什麼」，避免這支檔案反向 import store 成環。 */
export function setAuthExpiredHandler(handler: () => void): void {
  authExpiredHandler = handler
}

http.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshing: Promise<string | null> | null = null

async function renewAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  try {
    const response = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
    const data = response.data as { access_token: string; refresh_token: string }
    saveTokens(data.access_token, data.refresh_token)
    return data.access_token
  } catch {
    return null
  }
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined
    const isAuthCall = config?.url?.startsWith('/auth/') ?? false

    if (error.response?.status !== 401 || !config || config._retried || isAuthCall) {
      return Promise.reject(error)
    }

    // 同時 401 的請求共用同一次換票。
    refreshing ??= renewAccessToken().finally(() => {
      setTimeout(() => {
        refreshing = null
      }, 0)
    })
    const token = await refreshing

    if (!token) {
      clearTokens()
      authExpiredHandler?.()
      return Promise.reject(error)
    }

    config._retried = true
    config.headers = { ...config.headers, Authorization: `Bearer ${token}` }
    return http.request(config)
  },
)

/** 從後端的錯誤回應取出可以直接顯示給使用者的一句話。 */
export function errorMessage(error: unknown, fallback = '操作失敗，請稍後再試'): string {
  if (!axios.isAxiosError(error)) return fallback
  const body = error.response?.data as ApiErrorBody | undefined
  if (body?.message) return body.message
  if (Array.isArray(body?.detail) && body.detail.length > 0) {
    const first = body.detail[0] as { field?: string; message?: string }
    if (first.message) return first.field ? `${first.field}：${first.message}` : first.message
  }
  if (typeof body?.detail === 'string') return body.detail
  return error.message || fallback
}

/** 取出後端的錯誤代碼，需要依代碼分支處理時用。 */
export function errorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null
  return (error.response?.data as ApiErrorBody | undefined)?.code ?? null
}
