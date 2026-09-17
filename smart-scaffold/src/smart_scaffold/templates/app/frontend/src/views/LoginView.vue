<template>
  <div class="login-page">
    <a-card class="login-card" :bordered="false">
      <div class="login-brand">
        <span class="brand-mark">{{ brandInitial }}</span>
        <h1 class="brand-title">{{ appTitle }}</h1>
      </div>

      <a-alert v-if="errorText" type="error" :message="errorText" show-icon class="login-alert" />

      <a-form layout="vertical" :model="form" @finish="onSubmit">
        <a-form-item label="電子郵件" name="email" :rules="[{ required: true, message: '請輸入電子郵件' }]">
          <a-input v-model:value="form.email" size="large" placeholder="admin@example.com" autocomplete="username" />
        </a-form-item>

        <a-form-item label="密碼" name="password" :rules="[{ required: true, message: '請輸入密碼' }]">
          <a-input-password
            v-model:value="form.password"
            size="large"
            placeholder="請輸入密碼"
            autocomplete="current-password"
          />
        </a-form-item>

        <a-form-item>
          <a-checkbox v-model:checked="form.remember">記住我</a-checkbox>
        </a-form-item>

        <a-button type="primary" size="large" block html-type="submit" :loading="auth.loading">
          登入
        </a-button>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { errorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const appTitle = '{{title}}'
const brandInitial = appTitle.slice(0, 1)

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const errorText = ref('')
const form = reactive({ email: '', password: '', remember: true })

async function onSubmit(): Promise<void> {
  errorText.value = ''
  try {
    await auth.signIn(form.email, form.password, form.remember)
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await router.replace(next)
  } catch (error) {
    errorText.value = errorMessage(error, '登入失敗')
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 16px;
  background: var(--bg-body);
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--bg-content);
  box-shadow: 0 8px 32px rgb(0 0 0 / 8%);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: #fff;
  background: var(--color-primary);
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
}

.brand-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
}

.login-alert {
  margin-bottom: 16px;
}
</style>
