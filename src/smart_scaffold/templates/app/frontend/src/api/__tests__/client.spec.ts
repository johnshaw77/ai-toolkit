import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'

import { errorCode, errorMessage } from '../client'

function axiosErrorWith(data: unknown): AxiosError {
  const error = new AxiosError('請求失敗')
  error.response = { data, status: 400, statusText: '', headers: {}, config: error.config! }
  return error
}

describe('錯誤訊息', () => {
  it('優先用後端給的 message', () => {
    expect(errorMessage(axiosErrorWith({ code: 'CONFLICT', message: '代號重複' }))).toBe('代號重複')
  })

  it('沒有 message 時退而取第一個欄位錯誤', () => {
    const error = axiosErrorWith({ detail: [{ field: 'password', message: 'Field required' }] })
    expect(errorMessage(error)).toBe('password：Field required')
  })

  it('完全看不懂時用 fallback', () => {
    expect(errorMessage(new Error('boom'), '預設訊息')).toBe('預設訊息')
  })

  it('取得錯誤代碼', () => {
    expect(errorCode(axiosErrorWith({ code: 'NOT_FOUND' }))).toBe('NOT_FOUND')
    expect(errorCode(new Error('boom'))).toBeNull()
  })
})
