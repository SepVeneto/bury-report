<template>
  <div>
    <BcSearch
      v-model="params"
      :config="searchConfig"
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
        <RxSwitch v-model="row.enabled" />
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
import { getAlertRuleList, updateAlertRule } from '@/apis'
import { ref, shallowRef } from 'vue'
import RuleForm from './RuleForm.vue'
import RxSwitch from '@/components/switch/rxSwitch.vue'

const searchConfig = shallowRef([
  { catalog: 'input', name: '规则名称', prop: 'name' },
])
const tableConfig = shallowRef([
  { label: '名称', prop: 'name' },
  { label: '状态', prop: 'enabled' },
])
const params = ref({
  page: 1,
  size: 20,
})
const ruleModal = ref({
  show: false,
  data: {
    name: '',
    enabled: false,
  },
})

function getList() {
  return getAlertRuleList(params.value)
}

function handleUpdate() {
  ruleModal.value.show = true
}

function handleSubmit() {
  updateAlertRule(ruleModal.value.data)
}
</script>
