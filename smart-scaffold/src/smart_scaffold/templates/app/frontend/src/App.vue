<template>
  <a-config-provider :locale="zhTW" :theme="themeConfig">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import { theme } from 'ant-design-vue'
import zhTW from 'ant-design-vue/es/locale/zh_TW'
import { computed, onMounted, ref } from 'vue'

import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const primaryColor = ref('#1677ff')

// 主色的唯一來源是 theme.css 的 --color-primary，這裡讀出來餵給 antd，
// 免得兩個地方各寫一份色碼、改了一邊忘了另一邊。
onMounted(() => {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-primary')
  if (value.trim()) primaryColor.value = value.trim()
})

const themeConfig = computed(() => ({
  algorithm: appStore.darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: { colorPrimary: primaryColor.value },
}))
</script>
