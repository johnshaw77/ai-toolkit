import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { setAuthExpiredHandler } from './api/client'
import { router } from './router'
import { useAuthStore } from './stores/auth'

import 'ant-design-vue/dist/reset.css'
import './styles/theme.css'

const app = createApp(App)
// antd 的元件由 unplugin-vue-components 按需自動 import（見 vite.config.ts），
// 所以這裡沒有 app.use(Antd)。命令式 API（message 等）要在用到的地方自己 import。
app.use(createPinia())
app.use(router)

// token 換不回來時清掉狀態並導回登入頁。掛在這裡而不是 client.ts 裡面，
// 是為了不讓 api 層反向依賴 store。
const auth = useAuthStore()
setAuthExpiredHandler(() => {
  auth.forget()
  void router.push({ name: 'login', query: { next: router.currentRoute.value.fullPath } })
})

app.mount('#app')
