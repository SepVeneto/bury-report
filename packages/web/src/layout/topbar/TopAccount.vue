<template>
  <el-dropdown
    style="flex: 1; justify-content: flex-end;"
    @command="handleCommand"
  >
    <div class="user-info">
      <div>{{ name }}</div>
    </div>
    <template #dropdown>
      <el-dropdown-item command="resetPassword">
        修改密码
      </el-dropdown-item>
      <el-dropdown-item command="logout">
        退出登录
      </el-dropdown-item>
    </template>
  </el-dropdown>

  <bc-dialog
    v-model="visible"
    title="修改密码"
    width="550px"
    destroy-on-close
    @closed="onClosed"
    @submit="handleSubmit"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="rules"
    >
      <el-form-item
        label="原密码"
        prop="password_old"
      >
        <bc-input
          v-model="formData.password_old"
          show-password
        />
      </el-form-item>
      <el-form-item
        label="新密码"
        prop="password"
      >
        <bc-input
          v-model="formData.password"
          show-password
        />
      </el-form-item>
      <el-form-item
        label="确认密码"
        prop="password_confirm"
      >
        <bc-input
          v-model="formData.password_confirm"
          show-password
        />
      </el-form-item>
    </el-form>
  </bc-dialog>
</template>

<script lang="ts" setup>
import { checkPass, required } from '@/util/rules'
import { ref } from 'vue'
import type { FormInstance } from 'element-plus'
import { useRouter } from 'vue-router'

defineProps({
  name: {
    type: String,
    default: 'anonymous',
  },
})

const router = useRouter()
const formRef = ref<FormInstance>()
const visible = ref(false)
const formData = ref({
  password_old: '',
  password: '',
  password_confirm: '',
})
const rules = {
  password_old: [required('原密码'), { validator: checkPass, trigger: 'blur' }],
  password: [required('新密码'), { validator: checkPass, trigger: 'blur' }],
  password_confirm: {
    validator: (rule: any, value: any, cb: any) => {
      if (formData.value.password !== formData.value.password_confirm) {
        cb(new Error('两次输入的密码不一致'))
      } else {
        cb()
      }
    },
    trigger: 'blur',
  },
}

function onClosed() {
  formRef.value?.resetFields()
}
async function handleSubmit() {
  if (!formRef.value) {
    throw new Error('cannot find form')
  }
  await formRef.value.validate()
  visible.value = false
  localStorage.removeItem('token')
  await router.replace({ name: 'Login' })
  location.reload()
}
async function handleCommand(command: string) {
  if (command === 'resetPassword') {
    visible.value = true
  } else if (command === 'logout') {
    localStorage.removeItem('token')
    router.replace({ name: 'Login' })
    location.reload()
  }
}
</script>

<style scoped>
.user-info {
  height: 100%;
  color: #fff;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #fff;
  padding-right: 20px;
  cursor: default;
}
</style>
