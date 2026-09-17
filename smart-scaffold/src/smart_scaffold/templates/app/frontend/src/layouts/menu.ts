/**
 * 側邊欄選單。
 *
 * 刻意**寫死**而不是從路由產生：選單的順序、分組、哪些頁不該出現在選單裡
 * （例如詳細頁），跟路由表的結構是兩回事，硬要共用一份資料反而綁手綁腳。
 * `key` 一律等於 route name。
 */
export interface MenuNode {
  key: string
  label: string
  icon?: string
  /** 只有管理員看得到。 */
  adminOnly?: boolean
}

export const MENU: MenuNode[] = [
  { key: 'home', label: '首頁', icon: 'home' },
  // scaffold:if demo
  { key: 'items', label: '資料列表', icon: 'table' },
  // scaffold:endif
  { key: 'users', label: '使用者', icon: 'team', adminOnly: true },
]

export function filterMenu(menu: MenuNode[], isAdmin: boolean): MenuNode[] {
  return menu.filter((node) => !node.adminOnly || isAdmin)
}
