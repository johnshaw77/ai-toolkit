import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import * as authApi from '@/api/auth'
import type { User } from '@/api/auth'
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '@/api/token-storage'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(getAccessToken())
  const user = ref<User | null>(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => Boolean(accessToken.value))
  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  async function signIn(email: string, password: string, remember: boolean): Promise<void> {
    loading.value = true
    try {
      const data = await authApi.login(email, password)
      saveTokens(data.access_token, data.refresh_token, remember)
      accessToken.value = data.access_token
      user.value = data.user
    } finally {
      loading.value = false
    }
  }

  async function loadProfile(): Promise<void> {
    if (!accessToken.value || user.value) return
    user.value = await authApi.fetchMe()
  }

  async function signOut(): Promise<void> {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      // 一定要打後端作廢 refresh token，只清瀏覽器端的話那張票還是有效的。
      try {
        await authApi.logout(refreshToken)
      } catch {
        // 後端連不上也要讓使用者登得出去。
      }
    }
    forget()
  }

  /** 清掉本地狀態。token 過期被動登出時也走這裡。 */
  function forget(): void {
    clearTokens()
    accessToken.value = null
    user.value = null
  }

  return { accessToken, user, loading, isAuthenticated, isAdmin, signIn, loadProfile, signOut, forget }
})
