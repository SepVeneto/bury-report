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
        <ElLink
          v-for="item in data?.device"
          :key="item"
          @click="handleSelect(item)"
        >
          {{ item }}
        </ElLink>
      </ElCard>

      <ElCard
        header="会话ID"
        style="flex: 1;"
        shadow="never"
      >
        <ElLink
          v-for="item in data?.session"
          :key="item"
          @click="handleSelect(item)"
        >
          {{ item }}
        </ElLink>
      </ElCard>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { IReferer } from '@/apis'
import { queryCustomId } from '@/apis'
import { ref, shallowRef } from 'vue'

const customId = ref('')
const data = shallowRef<IReferer>()
const props = defineProps<{ closeFn:(content: string) => void }>()

async function handleSearch() {
  const res = await queryCustomId(customId.value)
  data.value = res
}

function handleSelect(content: string) {
  props.closeFn?.(content)
}
</script>
