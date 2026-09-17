/*
 * 資料列表頁。
 *
 * 這支是**形狀範本**：查詢條件 → 打 API → 畫表格 → 分頁，每一段都刻意寫得
 * 很直白，換成你自己的領域時照著改就好。
 */
import { api, confirmAction, escapeHtml, toast } from './app.js'

const PAGE_SIZE = 10

// 狀態的中文名由後端送過來（items.py 的 STATUS_LABELS 是唯一來源）。
const STATUS_LABEL = JSON.parse(
  document.querySelector('.data-table').dataset.statusLabels,
)
const STATUS_CLASS = { DRAFT: '', ACTIVE: 'tag-active', ARCHIVED: 'tag-archived' }

const state = { page: 1, sort: null, keyword: '', status: '', total: 0 }

const rowsEl = document.getElementById('rows')
const totalEl = document.getElementById('total')
const pageLabelEl = document.getElementById('page-label')
const prevEl = document.getElementById('prev')
const nextEl = document.getElementById('next')
const listErrorEl = document.getElementById('list-error')
const filtersEl = document.getElementById('filters')

const dialog = document.getElementById('item-dialog')
const form = document.getElementById('item-form')
const dialogTitle = document.getElementById('dialog-title')
const formError = document.getElementById('form-error')

let editingId = null

function statusTag(status) {
  const label = STATUS_LABEL[status] ?? status
  return `<span class="tag ${STATUS_CLASS[status] ?? ''}">${escapeHtml(label)}</span>`
}

function rowHtml(item) {
  return `
    <tr data-id="${item.id}" data-code="${escapeHtml(item.code)}">
      <td>${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${statusTag(item.status)}</td>
      <td class="align-right">${item.quantity}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="link-button" data-action="edit">編輯</button>
          <button type="button" class="link-button" data-action="delete">刪除</button>
        </div>
      </td>
    </tr>`
}

async function load() {
  listErrorEl.hidden = true
  rowsEl.innerHTML = '<tr class="placeholder-row"><td colspan="5">載入中…</td></tr>'

  const params = new URLSearchParams({ page: state.page, page_size: PAGE_SIZE })
  if (state.keyword) params.set('keyword', state.keyword)
  if (state.status) params.set('status', state.status)
  if (state.sort) params.set('sort', state.sort)

  try {
    const data = await api(`/api/items?${params}`)
    state.total = data.total
    rowsEl.innerHTML = data.items.length
      ? data.items.map(rowHtml).join('')
      : '<tr class="placeholder-row"><td colspan="5">目前沒有資料</td></tr>'
    totalEl.textContent = `共 ${data.total} 筆`
    pageLabelEl.textContent = `第 ${data.page} 頁`
    prevEl.disabled = data.page <= 1
    nextEl.disabled = data.page * data.page_size >= data.total
  } catch (error) {
    rowsEl.innerHTML = ''
    listErrorEl.textContent = error.message
    listErrorEl.hidden = false
  }
}

filtersEl.addEventListener('submit', (event) => {
  event.preventDefault()
  const data = new FormData(filtersEl)
  state.keyword = String(data.get('keyword') ?? '').trim()
  state.status = String(data.get('status') ?? '')
  state.page = 1
  load()
})

filtersEl.addEventListener('reset', () => {
  // reset 事件在欄位被清空「之前」觸發，所以要等這一輪跑完再讀值。
  setTimeout(() => {
    state.keyword = ''
    state.status = ''
    state.page = 1
    load()
  })
})

prevEl.addEventListener('click', () => {
  state.page = Math.max(1, state.page - 1)
  load()
})

nextEl.addEventListener('click', () => {
  state.page += 1
  load()
})

for (const button of document.querySelectorAll('.sort')) {
  button.addEventListener('click', () => {
    const field = button.dataset.sort
    state.sort = state.sort === field ? `-${field}` : field
    state.page = 1
    load()
  })
}

// -------------------------------------------------------------- 新增與編輯

function openDialog(item) {
  editingId = item ? item.id : null
  dialogTitle.textContent = item ? '編輯資料' : '新增資料'
  formError.hidden = true
  form.reset()

  form.elements.code.value = item?.code ?? ''
  form.elements.code.disabled = Boolean(item)
  form.elements.name.value = item?.name ?? ''
  form.elements.status.value = item?.status ?? 'DRAFT'
  form.elements.quantity.value = item?.quantity ?? 0
  form.elements.note.value = item?.note ?? ''

  dialog.showModal()
}

document.querySelector('[data-action="create"]').addEventListener('click', () => openDialog(null))
form.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close())

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  formError.hidden = true

  const data = new FormData(form)
  const payload = {
    name: String(data.get('name') ?? '').trim(),
    status: String(data.get('status') ?? 'DRAFT'),
    quantity: Number(data.get('quantity') ?? 0),
    note: String(data.get('note') ?? '').trim() || null,
  }

  try {
    if (editingId === null) {
      payload.code = String(data.get('code') ?? '').trim()
      await api('/api/items', { method: 'POST', body: JSON.stringify(payload) })
      toast('已新增')
    } else {
      await api(`/api/items/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      toast('已更新')
    }
    dialog.close()
    load()
  } catch (error) {
    formError.textContent = error.message
    formError.hidden = false
  }
})

rowsEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button) return
  const row = button.closest('tr')
  const id = Number(row.dataset.id)

  if (button.dataset.action === 'edit') {
    try {
      openDialog(await api(`/api/items/${id}`))
    } catch (error) {
      toast(error.message, 'error')
    }
    return
  }

  if (!(await confirmAction(`確定要刪除「${row.dataset.code}」嗎？`))) return
  try {
    await api(`/api/items/${id}`, { method: 'DELETE' })
    toast('已刪除')
    load()
  } catch (error) {
    toast(error.message, 'error')
  }
})

load()
