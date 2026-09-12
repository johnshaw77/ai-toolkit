/**
 * token 存放。
 *
 * 勾了「記住我」就放 localStorage（關掉瀏覽器還在），沒勾就放 sessionStorage
 * （關掉分頁就沒了）。兩邊**互斥**——寫進其中一邊時一定要清掉另一邊，否則
 * 會出現「登出後重開又自己登入了」這種鬼故事。
 */

const ACCESS_KEY = '{{name}}.access_token'
const REFRESH_KEY = '{{name}}.refresh_token'
const PERSIST_KEY = '{{name}}.persist'

function stores(): Storage[] {
  return [window.localStorage, window.sessionStorage]
}

function read(key: string): string | null {
  for (const store of stores()) {
    const value = store.getItem(key)
    if (value) return value
  }
  return null
}

function write(key: string, value: string | null, persist: boolean): void {
  const [local, session] = stores()
  const target = persist ? local : session
  const other = persist ? session : local
  other.removeItem(key)
  if (value === null) {
    target.removeItem(key)
  } else {
    target.setItem(key, value)
  }
}

export function isPersistent(): boolean {
  return window.localStorage.getItem(PERSIST_KEY) === '1'
}

export function getAccessToken(): string | null {
  return read(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY)
}

export function saveTokens(access: string, refresh: string, persist = isPersistent()): void {
  write(ACCESS_KEY, access, persist)
  write(REFRESH_KEY, refresh, persist)
  if (persist) {
    window.localStorage.setItem(PERSIST_KEY, '1')
  } else {
    window.localStorage.removeItem(PERSIST_KEY)
  }
}

export function clearTokens(): void {
  for (const store of stores()) {
    store.removeItem(ACCESS_KEY)
    store.removeItem(REFRESH_KEY)
  }
  window.localStorage.removeItem(PERSIST_KEY)
}
