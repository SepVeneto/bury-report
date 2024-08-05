<template>
  <ElForm
    :model="formData"
    label-width="100px"
  >
    <ElFormItem
      label="名称"
      prop="name"
    >
      <BcInput v-model="formData.name" />
    </ElFormItem>
    <ElFormItem
      label="触发器"
      prop="trigger_id"
    >
      <BcSelect
        v-model="formData.trigger_id"
        custom-label="name"
        custom-value="id"
        :api="getTriggerOptions"
      />
    </ElFormItem>
    <ElFormItem
      label="执行时间"
      prop="datetime"
    >
      <ElDatePicker
        v-model="formData.execute_time"
        type="datetime"
        value-format="YYYY-MM-DD HH:mm:ss"
      />
    </ElFormItem>
    <ElFormItem
      label="立即执行"
      prop="immediate"
    >
      <ElSwitch v-model="formData.immediate" />
    </ElFormItem>
  </ElForm>
</template>

<script setup lang="ts">
import type { TaskForm } from '@/apis'
import { getTriggerOptions } from '@/apis'
import type { FormInstance } from 'element-plus'
import type { PropType } from 'vue'
import { ref } from 'vue'

const props = defineProps({
  data: {
    type: Object as PropType<TaskForm>,
    default: () => ({}),
  },
})

const formData = ref(props.data)
const formRef = ref<FormInstance>()

defineExpose({
  async getFormData() {
    await formRef.value?.validate()
    return formData.value
  },
})
</script>
