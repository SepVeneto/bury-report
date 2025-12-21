<template>
  <ElForm
    :model="model"
    label-width="100px"
  >
    <ElFormItem
      label="规则名称"
      prop="name"
    >
      <ElInput v-model="model.name" />
    </ElFormItem>

    <ElFormItem
      label="状态"
    >
      <RxSwitch v-model="model.enabled" />
    </ElFormItem>
  </ElForm>
</template>

<script lang="ts" setup>
import RxSwitch from '@/components/switch/rxSwitch.vue'
import { ref } from 'vue'

const model = defineModel<{ name: string }>({ required: true })
</script>
