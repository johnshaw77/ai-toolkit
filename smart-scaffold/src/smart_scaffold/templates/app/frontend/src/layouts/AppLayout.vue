<template>
  <a-layout class="shell">
    <a-layout-header class="header">
      <div class="brand">
        <button
          class="collapse-btn"
          type="button"
          aria-label="收合側邊欄"
          @click="appStore.sidebarCollapsed = !appStore.sidebarCollapsed"
        >
          <MenuUnfoldOutlined v-if="appStore.sidebarCollapsed" />
          <MenuFoldOutlined v-else />
        </button>
        <span class="brand-mark">{{ brandInitial }}</span>
        <span class="brand-text">{{ appTitle }}</span>
      </div>

      <div class="header-actions">
        <a-tooltip :title="appStore.darkMode ? '切換成亮色' : '切換成深色'">
          <a-button
            type="text"
            aria-label="切換深色模式"
            @click="appStore.darkMode = !appStore.darkMode"
          >
            <BulbOutlined />
          </a-button>
        </a-tooltip>

        <a-dropdown>
          <button class="user-trigger" type="button" aria-label="使用者選單">
            <a-avatar size="small">{{ userInitial }}</a-avatar>
            <span class="user-name">{{ auth.user?.full_name ?? '未登入' }}</span>
          </button>
          <template #overlay>
            <a-menu>
              <a-menu-item key="email" disabled>{{ auth.user?.email }}</a-menu-item>
              <a-menu-divider />
              <a-menu-item key="logout" @click="handleSignOut">登出</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </a-layout-header>

    <a-layout>
      <a-layout-sider
        :collapsed="appStore.sidebarCollapsed"
        :width="200"
        :collapsed-width="56"
        :trigger="null"
        collapsible
        class="sider"
      >
        <a-menu :selected-keys="selectedKeys" mode="inline" @click="onMenuClick">
          <a-menu-item v-for="node in menu" :key="node.key">
            <template #icon>
              <HomeOutlined v-if="node.icon === 'home'" />
              <TableOutlined v-else-if="node.icon === 'table'" />
              <TeamOutlined v-else />
            </template>
            <span>{{ node.label }}</span>
          </a-menu-item>
        </a-menu>
      </a-layout-sider>

      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import {
  BulbOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TableOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { MENU, filterMenu } from './menu'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const appTitle = '{{title}}'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const appStore = useAppStore()

const menu = computed(() => filterMenu(MENU, auth.isAdmin))
const selectedKeys = computed(() => [String(route.name ?? 'home')])
const brandInitial = computed(() => appTitle.slice(0, 1))
const userInitial = computed(() => (auth.user?.full_name ?? '?').slice(0, 1))

function onMenuClick({ key }: { key: string | number }): void {
  void router.push({ name: String(key) })
}

async function handleSignOut(): Promise<void> {
  await auth.signOut()
  void router.push({ name: 'login' })
}
</script>

<style scoped>
.shell {
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--shadow-header);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.collapse-btn {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  color: var(--text-secondary);
  cursor: pointer;
  background: none;
  border: none;
  font-size: 16px;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: #fff;
  background: var(--color-primary);
  border-radius: 6px;
  font-weight: 600;
}

.brand-text {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  color: inherit;
  cursor: pointer;
  background: none;
  border: none;
  border-radius: 6px;
}

.user-name {
  color: var(--text-secondary);
}

.sider {
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
}

.sider :deep(.ant-menu) {
  background: transparent;
  border-inline-end: none;
}

.content {
  padding: 16px;
  overflow: auto;
}

@media (max-width: 640px) {
  .brand-text,
  .user-name {
    display: none;
  }
}
</style>
