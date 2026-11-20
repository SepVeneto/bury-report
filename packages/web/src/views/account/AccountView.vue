<template>
  <section class="account-page">
    <header class="account-header">
      <div>
        <h1>账号管理</h1>
        <p>管理后台登录账号、角色和启用状态。</p>
      </div>
      <ElButton @click="router.push({ name: 'Portal' })">
        返回项目
      </ElButton>
    </header>

    <div class="account-content">
      <bc-search
        v-model="params"
        :search="handleSearch"
        :config="searchConfig"
      >
        <bc-button @click="handleCreate">
          新增账号
        </bc-button>
      </bc-search>

      <bc-table
        ref="tableRef"
        v-model="params"
        :config="tableConfig"
        pagination
        :api="getList"
      >
        <template #role="{ row }">
          <ElTag :type="row.role === 'admin' ? 'danger' : 'info'">
            {{ row.role === 'admin' ? '管理员' : '普通用户' }}
          </ElTag>
        </template>
        <template #status="{ row }">
          <ElTag :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </ElTag>
        </template>
        <template #operate="{ row }">
          <bc-button
            type="primary"
            text
            @click="handleEdit(row)"
          >
            编辑
          </bc-button>
          <bc-button
            text
            type="danger"
            :disabled="row.id === store.accountId"
            @click="handleDelete(row)"
          >
            删除
          </bc-button>
        </template>
      </bc-table>
    </div>

    <ElDialog
      v-model="dialogVisible"
      :title="editingId ? '编辑账号' : '新增账号'"
      width="520px"
      destroy-on-close
      @closed="resetForm"
    >
      <ElForm
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="90px"
      >
        <ElFormItem
          label="用户名"
          prop="name"
        >
          <ElInput
            v-model="form.name"
            maxlength="32"
            placeholder="请输入用户名"
          />
        </ElFormItem>
        <ElFormItem
          label="角色"
          prop="role"
        >
          <ElSelect
            v-model="form.role"
            :disabled="editingId === store.accountId"
            style="width: 100%"
          >
            <ElOption
              label="管理员"
              value="admin"
            />
            <ElOption
              label="普通用户"
              value="member"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem
          label="状态"
          prop="status"
        >
          <ElRadioGroup
            v-model="form.status"
            :disabled="editingId === store.accountId"
          >
            <ElRadio value="active">
              启用
            </ElRadio>
            <ElRadio value="disabled">
              停用
            </ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem
          :label="editingId ? '重置密码' : '密码'"
          prop="password"
        >
          <ElInput
            v-model="form.password"
            type="password"
            show-password
            :placeholder="editingId ? '留空则不修改密码' : '6-16位密码'"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">
          取消
        </ElButton>
        <ElButton
          type="primary"
          :loading="submitting"
          @click="handleSubmit"
        >
          保存
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessageBox,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElTag,
} from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { computed, reactive, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '@/store'
import {
  type Account,
  type AccountRole,
  type AccountStatus,
  createAccount,
  deleteAccount,
  getAccountList,
  getAccountProfile,
  updateAccount,
} from '@/apis'
import { checkPass, required } from '@/util/rules'

defineOptions({
  name: 'AccountView',
})

const roleOptions = [
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'member' },
]
const statusOptions = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'disabled' },
]

const router = useRouter()
const store = useApp()
const params = ref({
  page: 1,
  size: 20,
  name: '',
  role: '' as AccountRole | '',
  status: '' as AccountStatus | '',
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '用户名', prop: 'name', minWidth: 160 },
  { label: '角色', prop: 'role', width: 110 },
  { label: '状态', prop: 'status', width: 100 },
  { label: '最近登录', prop: 'last_login_time', width: 180 },
  { label: '创建时间', prop: 'create_time', width: 180 },
  { label: '操作', prop: 'operate', width: 160, fixed: 'right' },
])
const searchConfig = shallowRef([
  { catalog: 'input', prop: 'name', name: '用户名' },
  { catalog: 'select', prop: 'role', name: '角色', options: roleOptions },
  { catalog: 'select', prop: 'status', name: '状态', options: statusOptions },
])

const dialogVisible = ref(false)
const editingId = ref('')
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  password: '',
  role: 'member' as AccountRole,
  status: 'active' as AccountStatus,
})
const formRules = computed<FormRules>(() => ({
  name: [required('用户名')],
  role: [required('角色')],
  status: [required('状态')],
  password: editingId.value
    ? []
    : [
        required('密码'),
        { validator: checkPass, trigger: 'blur' },
      ],
}))

function getList() {
  return getAccountList(params.value)
}

function handleSearch() {
  params.value.page = 1
  tableRef.value.getList()
}

function handleCreate() {
  resetForm()
  dialogVisible.value = true
}

function handleEdit(account: Account) {
  editingId.value = account.id
  form.name = account.name
  form.role = account.role
  form.status = account.status
  form.password = ''
  dialogVisible.value = true
}

async function handleDelete(account: Account) {
  await ElMessageBox.confirm(
    `确定删除账号“${account.name}”吗？删除后该账号将无法登录。`,
    '删除账号',
    {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    },
  )
  await deleteAccount(account.id)
  handleSearch()
}

async function handleSubmit() {
  await formRef.value?.validate()
  submitting.value = true
  try {
    const payload = {
      name: form.name.trim(),
      role: form.role,
      status: form.status,
      ...(form.password ? { password: form.password } : {}),
    }
    if (editingId.value) {
      await updateAccount(editingId.value, payload)
      if (editingId.value === store.accountId) {
        store.setAccount(await getAccountProfile())
      }
    } else {
      await createAccount(payload)
    }
    dialogVisible.value = false
    handleSearch()
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  editingId.value = ''
  form.name = ''
  form.password = ''
  form.role = 'member'
  form.status = 'active'
  formRef.value?.clearValidate()
}
</script>

<style scoped>
.account-page {
  min-height: 100vh;
  background: #f4f7fb;
}
.account-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 32px;
  color: #fff;
  background: linear-gradient(110deg, #1883e8, #46a6ef);
}
.account-header h1 {
  margin: 0 0 6px;
  font-size: 24px;
}
.account-header p {
  margin: 0;
  color: rgba(255, 255, 255, 0.82);
}
.account-content {
  margin: 24px;
  padding: 24px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 24px rgba(31, 60, 92, 0.08);
}
</style>
