<template>
  <div>
    <BcSearch
      v-model="params"
      :config="searchConfig"
      :search="handleSearch"
    >
      <BcButton @click="handleUpdate()">
        新增
      </BcButton>
    </BcSearch>
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      :api="getList"
    >
      <template #enabled="{ row }">
        <RxSwitch
          :model-value="row.enabled"
          @change="handleToggle(row, $event)"
        />
      </template>

      <template #operate="{row}">
        <BcButton
          text
          type="primary"
          @click="handleUpdate(row)"
        >编辑</BcButton>
        <BcButton text type="danger" confirm @click="handleDelete(row)">删除</BcButton>
      </template>
    </bc-table>

    <BcDialog
      v-model="ruleModal.show"
      :title="ruleModal.data.id ? '编辑规则' : '新增规则'"
      width="550px"
      @submit="handleSubmit"
    >
      <RuleForm
        v-model="ruleModal.data"
      />
    </BcDialog>
  </div>
</template>

<script lang="ts" setup>
import { AlertRule, deleteAlertRule, getAlertRuleList, toggleAlertRule, updateAlertRule } from '@/apis'
import { ref, shallowRef, useTemplateRef } from 'vue'
import RuleForm from './RuleForm.vue'
import RxSwitch from '@/components/switch/rxSwitch.vue'
import { WithDetail } from '@/util/tools'

const searchConfig = shallowRef([
  { catalog: 'input', name: '规则名称', prop: 'name' },
])
const tableConfig = shallowRef([
  { label: '名称', prop: 'name' },
  { label: '类型', prop: 'source.log_type' },
  { label: '触发源', prop: 'source.type' },
  { label: '策略', prop: 'strategy', filter: (val: string) => ({ once: '仅一次', window: '窗口期触发', limit: '阈值触发'}[val]) },
  { label: '状态', prop: 'enabled' },
  { label: '操作', prop: 'operate' },
])
const params = ref({
  page: 1,
  size: 20,
})
const defaultForm = {
  name: '',
  enabled: false,
  strategy: 'once',
  source: {
    type: 'collection',
    log_type: 'error',
  },
  notify: {
    url: '',
  }
} as AlertRule
const ruleModal = ref({
  show: false,
  data: defaultForm,
})

const refTable = useTemplateRef('tableRef')
function handleSearch() {
  params.value.page = 1
  // @ts-expect-error: ignore
  refTable.value?.getList()
}

async function handleDelete(row: WithDetail<AlertRule>) {
  await deleteAlertRule(row.id)
  // @ts-expect-error: ignore
  refTable.value?.getList()
}

function getList() {
  return getAlertRuleList(params.value)
}

function handleUpdate(row?: WithDetail<AlertRule>) {
  ruleModal.value.show = true
  ruleModal.value.data = JSON.parse(JSON.stringify(row ? row : defaultForm))
}

async function handleSubmit() {
  await updateAlertRule(ruleModal.value.data)
  ruleModal.value.show = false
  // @ts-expect-error: ignore
  refTable.value?.getList()
}
async function handleToggle(row: WithDetail<AlertRule>, val: boolean) {
  await toggleAlertRule(row.id, val)
  // @ts-expect-error: ignore
  refTable.value?.getList()
}
</script>
