<template>
  <div>
    <BcInput
      v-model="customId"
      v-focus
      placeholder="自定义ID"
      @keyup.enter="handleSearch"
    >
      <template #append>
        <BcButton @click="handleSearch">
          查询
        </BcButton>
      </template>
    </BcInput>

    <div
      v-if="data"
      style="display: flex; margin-top: 20px; column-gap: 10px;"
    >
      <ElCard
        header="设备ID"
        style="flex: 1;"
        shadow="never"
      >
        <div
          v-for="item in devices"
          :key="item"
          class="index-item"
        >
          <ElLink @click="handleSelect(item, 'uuid')">
            {{ item }}
          </ElLink>
        </div>
      </ElCard>

      <ElCard
        header="会话ID"
        style="flex: 1;"
        shadow="never"
      >
        <div
          v-for="item in sessions"
          :key="item"
          class="index-item"
        >
          <ElLink @click="handleSelect(item, 'session')">
            {{ item }}
          </ElLink>
        </div>
      </ElCard>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { IReferer } from '@/apis'
import { queryCustomId } from '@/apis'
import { computed, ref, shallowRef } from 'vue'

const customId = ref('')
const data = shallowRef<IReferer>()
const devices = computed(() => [...(data.value?.device || [])].reverse())
const sessions = computed(() => [...(data.value?.session || [])].reverse())
const props = defineProps<{
  closeFn:(content: string, type: 'uuid' | 'session') => void
}>()

async function handleSearch() {
  const res = await queryCustomId(customId.value)
  data.value = res
}

function handleSelect(content: string, type: 'uuid' | 'session') {
  props.closeFn?.(content, type)
}
</script>
