<template>
  <div class="items">
    <a-page-header title="資料列表" sub-title="這是範例領域，換成你自己的之後把整支檔案改掉" />

    <ProTable
      ref="tableRef"
      :columns="columns"
      :filters="filters"
      :request="listItems"
    >
      <template #toolbar>
        <a-button type="primary" @click="openCreate">新增</a-button>
      </template>

      <template #cell-status="{ record }">
        <a-tag :color="STATUS_COLOR[(record as Item).status]">
          {{ STATUS_LABEL[(record as Item).status] }}
        </a-tag>
      </template>

      <template #cell-actions="{ record }">
        <a-space>
          <a-button type="link" size="small" @click="openEdit(record as Item)">編輯</a-button>
          <a-popconfirm title="確定要刪除嗎？" ok-text="刪除" cancel-text="取消" @confirm="remove(record as Item)">
            <a-button type="link" size="small" danger>刪除</a-button>
          </a-popconfirm>
        </a-space>
      </template>
    </ProTable>

    <a-modal
      v-model:open="modalOpen"
      :title="editing ? '編輯資料' : '新增資料'"
      :confirm-loading="saving"
      ok-text="儲存"
      cancel-text="取消"
      @ok="save"
    >
      <a-form layout="vertical" :model="form">
        <a-form-item label="代號">
          <a-input v-model:value="form.code" :disabled="Boolean(editing)" placeholder="例如 A-001" />
        </a-form-item>
        <a-form-item label="名稱">
          <a-input v-model:value="form.name" placeholder="請輸入名稱" />
        </a-form-item>
        <a-form-item label="狀態">
          <a-select v-model:value="form.status" :options="STATUS_OPTIONS" />
        </a-form-item>
        <a-form-item label="數量">
          <a-input-number v-model:value="form.quantity" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="備註">
          <a-textarea v-model:value="form.note" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { message } from 'ant-design-vue'
import { reactive, ref } from 'vue'

import { errorMessage } from '@/api/client'
import { createItem, deleteItem, listItems, updateItem, type Item, type ItemStatus } from '@/api/items'
import ProTable, { type ProTableColumn, type ProTableFilter } from '@/components/ProTable.vue'

const STATUS_LABEL: Record<ItemStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '啟用',
  ARCHIVED: '封存',
}

const STATUS_COLOR: Record<ItemStatus, string> = {
  DRAFT: 'default',
  ACTIVE: 'green',
  ARCHIVED: 'orange',
}

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ItemStatus[]).map((value) => ({
  label: STATUS_LABEL[value],
  value,
}))

const columns: ProTableColumn[] = [
  { key: 'code', title: '代號', width: 140, sortable: true },
  { key: 'name', title: '名稱', sortable: true },
  { key: 'status', title: '狀態', width: 110 },
  { key: 'quantity', title: '數量', width: 100, align: 'right', sortable: true },
  { key: 'actions', title: '操作', width: 140 },
]

const filters: ProTableFilter[] = [
  { key: 'keyword', label: '關鍵字', type: 'text', placeholder: '搜尋代號或名稱' },
  { key: 'status', label: '狀態', type: 'select', options: STATUS_OPTIONS },
]

const tableRef = ref<{ reload: () => Promise<void> } | null>(null)
const modalOpen = ref(false)
const saving = ref(false)
const editing = ref<Item | null>(null)
const form = reactive({ code: '', name: '', status: 'DRAFT' as ItemStatus, quantity: 0, note: '' })

function openCreate(): void {
  editing.value = null
  Object.assign(form, { code: '', name: '', status: 'DRAFT', quantity: 0, note: '' })
  modalOpen.value = true
}

function openEdit(item: Item): void {
  editing.value = item
  Object.assign(form, {
    code: item.code,
    name: item.name,
    status: item.status,
    quantity: item.quantity,
    note: item.note ?? '',
  })
  modalOpen.value = true
}

async function save(): Promise<void> {
  saving.value = true
  try {
    if (editing.value) {
      await updateItem(editing.value.id, {
        name: form.name,
        status: form.status,
        quantity: form.quantity,
        note: form.note || null,
      })
      message.success('已更新')
    } else {
      await createItem({ ...form, note: form.note || null })
      message.success('已新增')
    }
    modalOpen.value = false
    await tableRef.value?.reload()
  } catch (error) {
    message.error(errorMessage(error, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

async function remove(item: Item): Promise<void> {
  try {
    await deleteItem(item.id)
    message.success('已刪除')
    await tableRef.value?.reload()
  } catch (error) {
    message.error(errorMessage(error, '刪除失敗'))
  }
}
</script>

<style scoped>
.items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
