<template>
  <section class="account-page">
    <header class="account-header">
      <div>
        <h1>账号管理</h1>
        <p>管理后台登录账号、角色、启用状态和双因素验证。</p>
      </div>
      <ElButton @click="router.push({ name: 'Portal' })">
        返回项目
      </ElButton>
    </header>

    <section class="security-panel">
      <div>
        <strong>当前账号双因素验证</strong>
        <p>
          {{
            twoFactorEnabled
              ? '已启用，登录时需要输入身份验证器动态码。'
              : '未启用，建议绑定身份验证器提升账号安全。'
          }}
        </p>
      </div>
      <div class="security-action">
        <ElTag :type="twoFactorEnabled ? 'success' : 'info'">
          {{ twoFactorEnabled ? '已启用' : '未启用' }}
        </ElTag>
        <ElButton
          :type="twoFactorEnabled ? 'danger' : 'primary'"
          plain
          @click="twoFactorDialogRef?.open()"
        >
          {{ twoFactorEnabled ? '关闭双因素' : '开启双因素' }}
        </ElButton>
      </div>
    </section>

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
          <ElSwitch
            :model-value="row.status === 'active'"
            :disabled="row.id === store.accountId"
            :loading="statusUpdatingId === row.id"
            @change="handleStatusChange(row, $event)"
          />
        </template>
        <template #twoFactor="{ row }">
          <ElTag :type="row.two_factor_enabled ? 'success' : 'info'">
            {{ row.two_factor_enabled ? '已开启' : '未开启' }}
          </ElTag>
        </template>
        <template #projectAccess="{ row }">
          <span v-if="row.role === 'admin'">全部项目</span>
          <span v-else-if="!row.project_ids.length">未授权</span>
          <span v-else>
            {{ row.project_ids.map(projectName).join('、') }}
          </span>
        </template>
        <template #initialization="{ row }">
          <ElTag
            v-if="row.must_reset_password"
            type="warning"
          >
            待重置密码
          </ElTag>
          <ElTag
            v-else-if="row.must_bind_two_factor"
            type="warning"
          >
            待绑定2FA
          </ElTag>
          <ElTag
            v-else
            type="success"
          >
            已完成
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
            v-if="row.two_factor_enabled"
            text
            @click="handleResetTwoFactor(row)"
          >
            重置2FA
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
      width="580px"
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
          v-if="form.role === 'member'"
          label="可查看项目"
        >
          <ElSelect
            v-model="form.project_ids"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择该账号可查看的项目"
            style="width: 100%"
          >
            <ElOption
              v-for="project in projects"
              :key="project.id"
              :label="project.name"
              :value="project.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem
          v-else
          label="项目权限"
        >
          <span class="all-project-tip">管理员可查看全部项目</span>
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
          <div
            v-if="!editingId"
            class="initial-password-tip"
          >
            该密码仅用于首次登录，账号登录后必须重置密码并绑定身份验证器。
          </div>
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

    <TwoFactorDialog
      ref="twoFactorDialogRef"
      @updated="handleSearch"
    />
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
  ElSwitch,
  ElTag,
} from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { computed, onMounted, reactive, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '@/store'
import {
  type Account,
  type AccountRole,
  type AccountStatus,
  type Project,
  createAccount,
  deleteAccount,
  getAccountList,
  getAccountProfile,
  getProjectList,
  resetAccountTwoFactor,
  updateAccount,
} from '@/apis'
import { checkPass, required } from '@/util/rules'
import TwoFactorDialog from '@/components/TwoFactorDialog.vue'

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
  { label: '双因素', prop: 'twoFactor', width: 100 },
  { label: '项目权限', prop: 'projectAccess', width: 220 },
  { label: '初始化', prop: 'initialization', width: 120 },
  { label: '最近登录', prop: 'last_login_time', width: 180 },
  { label: '创建时间', prop: 'create_time', width: 180 },
  { label: '操作', prop: 'operate', width: 260, fixed: 'right' },
])
const searchConfig = shallowRef([
  { catalog: 'input', prop: 'name', name: '用户名' },
  { catalog: 'select', prop: 'role', name: '角色', options: roleOptions },
  { catalog: 'select', prop: 'status', name: '状态', options: statusOptions },
])

const dialogVisible = ref(false)
const projects = ref<Project[]>([])
const editingId = ref('')
const submitting = ref(false)
const statusUpdatingId = ref('')
const twoFactorDialogRef = ref<InstanceType<typeof TwoFactorDialog>>()
const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  password: '',
  role: 'member' as AccountRole,
  status: 'active' as AccountStatus,
  project_ids: [] as string[],
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
const twoFactorEnabled = computed(() => !!store.account?.two_factor_enabled)
const projectNames = computed(() => new Map(
  projects.value.map(project => [project.id, project.name]),
))

onMounted(async () => {
  projects.value = await getProjectList()
})

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
  form.project_ids = [...account.project_ids]
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

async function handleStatusChange(account: Account, enabled: boolean | string | number) {
  if (account.id === store.accountId || statusUpdatingId.value) return

  const status: AccountStatus = enabled ? 'active' : 'disabled'
  statusUpdatingId.value = account.id
  try {
    await updateAccount(account.id, {
      name: account.name,
      role: account.role,
      status,
    })
    account.status = status
  } finally {
    statusUpdatingId.value = ''
  }
}

async function handleResetTwoFactor(account: Account) {
  await ElMessageBox.confirm(
    `确定重置账号“${account.name}”的双因素验证吗？重置后该账号下次登录只需要密码。`,
    '重置双因素验证',
    {
      type: 'warning',
      confirmButtonText: '重置',
      cancelButtonText: '取消',
    },
  )
  await resetAccountTwoFactor(account.id)
  if (account.id === store.accountId) {
    store.setAccount(await getAccountProfile())
  }
  handleSearch()
}

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const payload = {
      name: form.name.trim(),
      role: form.role,
      status: form.status,
      project_ids: form.role === 'member' ? form.project_ids : [],
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
  form.project_ids = []
  formRef.value?.clearValidate()
}

function projectName(id: string) {
  return projectNames.value.get(id) || id
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
.security-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin: 24px 24px 0;
  padding: 20px 24px;
  border: 1px solid #dbe9f7;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 24px rgba(31, 60, 92, 0.06);
}
.security-panel strong {
  color: #1f2d3d;
  font-size: 16px;
}
.security-panel p {
  margin: 6px 0 0;
  color: #697b8c;
}
.security-action {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.all-project-tip {
  color: #697b8c;
}
.initial-password-tip {
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
</style>
