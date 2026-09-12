<template>
  <div class="users">
    <a-page-header title="使用者" sub-title="只有管理員看得到這一頁" />
    <ProTable :columns="columns" :request="request">
      <template #cell-role="{ record }">
        <a-tag :color="(record as User).role === 'ADMIN' ? 'blue' : 'default'">
          {{ (record as User).role === 'ADMIN' ? '管理員' : '一般使用者' }}
        </a-tag>
      </template>
      <template #cell-is_active="{ record }">
        <a-badge :status="(record as User).is_active ? 'success' : 'default'" :text="(record as User).is_active ? '啟用' : '停用'" />
      </template>
    </ProTable>
  </div>
</template>

<script setup lang="ts">
import type { User } from '@/api/auth'
import { http, type Page } from '@/api/client'
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue'

const columns: ProTableColumn[] = [
  { key: 'email', title: '電子郵件', sortable: true },
  { key: 'full_name', title: '姓名', sortable: true },
  { key: 'role', title: '角色', width: 140 },
  { key: 'is_active', title: '狀態', width: 110 },
]

async function request(params: Record<string, unknown>): Promise<Page<User>> {
  const { data } = await http.get<Page<User>>('/users', { params })
  return data
}
</script>

<style scoped>
.users {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
