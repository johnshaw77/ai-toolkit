<template>
  <div class="home">
    <a-page-header title="首頁" :sub-title="appTitle" />

    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :sm="12" :lg="8">
        <a-card>
          <a-statistic title="登入身分" :value="auth.user?.full_name ?? '—'" />
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="8">
        <a-card>
          <a-statistic title="角色" :value="auth.user?.role ?? '—'" />
        </a-card>
      </a-col>
      <!-- scaffold:if demo -->
      <a-col :xs="24" :sm="24" :lg="8">
        <a-card>
          <a-statistic title="資料筆數" :value="itemCount" :loading="loading" />
        </a-card>
      </a-col>
      <!-- scaffold:endif -->
    </a-row>

    <a-card title="接下來做什麼" class="next-card">
      <ol class="next-list">
        <!-- scaffold:if demo -->
        <li>把 <code>Item</code> 換成你自己的領域模型：後端的 model / schema / repository / endpoint，以及前端的 <code>ItemsView</code>。</li>
        <!-- scaffold:endif -->
        <!-- scaffold:ifnot demo -->
        <li>後端加一個模組：<code>models/</code> 建表 → <code>schemas/</code> 定形狀 → <code>repositories/</code> 寫查詢 → <code>api/v1/endpoints/</code> 加端點。</li>
        <!-- scaffold:endif -->
        <li>需要新頁面時，在 <code>src/router/index.ts</code> 加一條路由，再到 <code>src/layouts/menu.ts</code> 加一筆選單。</li>
        <li>列表一律用 <code>ProTable</code> 接後端的 <code>Page&lt;T&gt;</code> 格式，不要自己再發明一種分頁。</li>
      </ol>
    </a-card>
  </div>
</template>

<script setup lang="ts">
// scaffold:if demo
import { onMounted, ref } from 'vue'

import { listItems } from '@/api/items'
// scaffold:endif
import { useAuthStore } from '@/stores/auth'

const appTitle = '{{title}}'
const auth = useAuthStore()

// scaffold:if demo
const itemCount = ref(0)
const loading = ref(true)

onMounted(async () => {
  try {
    const page = await listItems({ page: 1, page_size: 1 })
    itemCount.value = page.total
  } finally {
    loading.value = false
  }
})
// scaffold:endif
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.next-card :deep(.ant-card-body) {
  padding-top: 8px;
}

.next-list {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
  line-height: 2;
}
</style>
