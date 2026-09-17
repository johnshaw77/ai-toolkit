<template>
  <a-result status="404" title="404" sub-title="找不到這個頁面">
    <template #extra>
      <a-button type="primary" @click="router.push({ name: 'home' })">回首頁</a-button>
    </template>
  </a-result>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>
