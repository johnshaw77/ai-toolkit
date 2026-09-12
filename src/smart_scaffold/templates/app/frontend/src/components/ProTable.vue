<template>
  <div class="pro-table">
    <div v-if="filters.length || $slots.toolbar" class="toolbar">
      <a-space wrap>
        <template v-for="filter in filters" :key="filter.key">
          <a-input
            v-if="filter.type === 'text'"
            v-model:value="draft[filter.key]"
            :placeholder="filter.placeholder ?? filter.label"
            :style="{ width: (filter.width ?? 200) + 'px' }"
            allow-clear
            @press-enter="search"
          />
          <a-select
            v-else
            v-model:value="draft[filter.key]"
            :options="filter.options"
            :placeholder="filter.placeholder ?? filter.label"
            :style="{ width: (filter.width ?? 160) + 'px' }"
            allow-clear
          />
        </template>
        <a-button type="primary" :loading="loading" @click="search">查詢</a-button>
        <a-button @click="reset">重置</a-button>
      </a-space>
      <a-space>
        <slot name="toolbar" />
      </a-space>
    </div>

    <a-alert v-if="errorText" type="error" :message="errorText" show-icon banner />

    <a-table
      :columns="antColumns"
      :data-source="rows"
      :loading="loading"
      :pagination="pagination"
      :row-key="(row: T) => row.id"
      :scroll="{ x: 'max-content' }"
      size="middle"
      @change="onTableChange"
    >
      <template #bodyCell="cell">
        <slot :name="`cell-${String(cell.column.key)}`" v-bind="cell" />
      </template>
      <template #emptyText>
        <a-empty :description="emptyText" />
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: string }">
import type { TablePaginationConfig, TableProps } from 'ant-design-vue'
import { onMounted, reactive, ref } from 'vue'

import { errorMessage, type Page } from '@/api/client'

export interface ProTableColumn {
  key: string
  title: string
  dataIndex?: string
  width?: number
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
}

export interface ProTableFilter {
  key: string
  label: string
  type: 'text' | 'select'
  placeholder?: string
  options?: { label: string; value: string }[]
  width?: number
}

type QueryParams = Record<string, unknown>

const props = withDefaults(
  defineProps<{
    columns: ProTableColumn[]
    request: (params: QueryParams) => Promise<Page<T>>
    filters?: ProTableFilter[]
    pageSize?: number
    emptyText?: string
  }>(),
  { filters: () => [], pageSize: 10, emptyText: '目前沒有資料' },
)

const rows = ref<T[]>([]) as { value: T[] }
const total = ref(0)
const page = ref(1)
const pageSize = ref(props.pageSize)
const sort = ref<string | undefined>()
const loading = ref(false)
const errorText = ref('')
const draft = reactive<Record<string, string | undefined>>({})
const applied = ref<QueryParams>({})

const antColumns = props.columns.map((column) => ({
  key: column.key,
  title: column.title,
  dataIndex: column.dataIndex ?? column.key,
  width: column.width,
  align: column.align,
  sorter: column.sortable ? true : undefined,
}))

const pagination = ref<TablePaginationConfig>({
  current: 1,
  pageSize: pageSize.value,
  total: 0,
  showSizeChanger: true,
  showTotal: (count: number) => `共 ${count} 筆`,
})

async function load(): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    const data = await props.request({
      ...applied.value,
      page: page.value,
      page_size: pageSize.value,
      sort: sort.value,
    })
    rows.value = data.items
    total.value = data.total
    pagination.value = {
      ...pagination.value,
      current: data.page,
      pageSize: data.page_size,
      total: data.total,
    }
  } catch (error) {
    errorText.value = errorMessage(error, '載入失敗')
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function currentFilters(): QueryParams {
  const params: QueryParams = {}
  for (const [key, value] of Object.entries(draft)) {
    if (value !== undefined && value !== '') params[key] = value
  }
  return params
}

function search(): void {
  applied.value = currentFilters()
  page.value = 1
  void load()
}

function reset(): void {
  for (const key of Object.keys(draft)) draft[key] = undefined
  search()
}

const onTableChange: TableProps<T>['onChange'] = (nextPagination, _filters, sorter) => {
  page.value = nextPagination.current ?? 1
  pageSize.value = nextPagination.pageSize ?? props.pageSize
  const single = Array.isArray(sorter) ? sorter[0] : sorter
  if (single?.order && single.columnKey) {
    sort.value = (single.order === 'descend' ? '-' : '') + String(single.columnKey)
  } else {
    sort.value = undefined
  }
  void load()
}

onMounted(load)

defineExpose({ reload: load, search })
</script>

<style scoped>
.pro-table {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}
</style>
