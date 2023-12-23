<template>
  <el-form
    ref="formRef"
    :model="formData"
    label-width="100px"
    :rules="rules"
  >
    <el-form-item label="名称" prop="name">
      <bc-input v-model="formData.name" width="200px" />
    </el-form-item>
    <el-form-item label="状态" prop="status">
      <bc-select
        v-model="formData.status"
        :api="getStatus"
        custom-label="name"
        custom-value="id"
      />
    </el-form-item>
  </el-form>
</template>

<script lang="ts" setup>
import { ref, shallowRef, onMounted } from 'vue'
import { required } from '@/util/rules'
const props = defineProps({
  detailId: Number,
})
const formRef = shallowRef()
const rules = {
  name: required('名称'),
  status: required('状态')
}
const formData = ref({
  name: '',
  status: '',
})

onMounted(() => {
  console.log('onMounted', props.detailId)
})

function getStatus() {
  return Promise.resolve({
    data: [
      { id: 1, name: '是' },
      { id: 2, name: '否' },
    ]
  })
}
async function getFormData() {
  await formRef.value.validate()
  return formData.value;
}
defineExpose({
  getFormData,
})
</script>
