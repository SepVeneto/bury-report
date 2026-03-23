<template>
  <ElForm
    v-loading="loading"
    :model="form"
  >
    <ElFormItem label="推送状态">
      <ElSwitch
        v-model="form.status"
        active-text="开启"
        inactive-text="关闭"
      />
    </ElFormItem>
    <ElFormItem label="推送地址">
      <BcInput v-model="form.notify" />
    </ElFormItem>
    <BcButton @click="handleManual">
      手动推送
    </BcButton>
  </ElForm>
</template>

<script lang="ts" setup>
import type { AlertSetting } from '@/apis'
import { getAlertSetting, pushAlertSummary } from '@/apis'
import { ref } from 'vue'
const form = ref<AlertSetting>({
  status: false,
  notify: '',
})

const loading = ref(true)
getAlertSetting().then(res => {
  form.value = res
}).finally(() => {
  loading.value = false
})

function handleManual() {
  pushAlertSummary()
}

defineExpose({
  getFormData() {
    return form.value
  },
})
</script>
