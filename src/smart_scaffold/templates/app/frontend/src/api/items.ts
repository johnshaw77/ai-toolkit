/**
 * 範例領域的 API。換成真功能時整份換掉，但保留這個形狀：
 * 列表回 Page<T>，查詢參數用 page / page_size / sort。
 */
import { http, type Page } from './client'

export type ItemStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export interface Item {
  id: string
  code: string
  name: string
  status: ItemStatus
  quantity: number
  note: string | null
  created_at: string
  updated_at: string
}

export interface ItemQuery {
  keyword?: string
  status?: ItemStatus
  page?: number
  page_size?: number
  sort?: string
}

export interface ItemPayload {
  code: string
  name: string
  status?: ItemStatus
  quantity?: number
  note?: string | null
}

export async function listItems(params: ItemQuery): Promise<Page<Item>> {
  const { data } = await http.get<Page<Item>>('/items', { params })
  return data
}

export async function createItem(payload: ItemPayload): Promise<Item> {
  const { data } = await http.post<Item>('/items', payload)
  return data
}

export async function updateItem(id: string, payload: Partial<ItemPayload>): Promise<Item> {
  const { data } = await http.patch<Item>(`/items/${id}`, payload)
  return data
}

export async function deleteItem(id: string): Promise<void> {
  await http.delete(`/items/${id}`)
}
