import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** 分頁標題與側邊欄文字都用它，必填。 */
    title: string
    /** 不用登入就能看的頁面。 */
    public?: boolean
    /** 只有管理員能進。 */
    adminOnly?: boolean
  }
}

const APP_TITLE = '{{title}}'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登入', public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
          meta: { title: '首頁' },
        },
        // scaffold:if demo
        {
          path: 'items',
          name: 'items',
          component: () => import('@/views/ItemsView.vue'),
          meta: { title: '資料列表' },
        },
        // scaffold:endif
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { title: '使用者', adminOnly: true },
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/views/NotFoundView.vue'),
          meta: { title: '找不到頁面' },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    return true
  }
  if (!auth.isAuthenticated) {
    return { name: 'login', query: { next: to.fullPath } }
  }
  try {
    await auth.loadProfile()
  } catch {
    auth.forget()
    return { name: 'login', query: { next: to.fullPath } }
  }
  if (to.meta.adminOnly && !auth.isAdmin) {
    return { name: 'home' }
  }
  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title} - ${APP_TITLE}`
})
