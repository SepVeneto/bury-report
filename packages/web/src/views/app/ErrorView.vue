<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    />
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      :api="getList"
    >
      <template #device_time-header>
        <div style="display: flex; align-items: center;">
          <span style="margin-right: 10px;">发生时间</span>
          <IconTips content="该时间为设备的系统时间，仅供参考" />
        </div>
      </template>
      <template #uuid="{ row }">
        <DeviceLink
          :uuid="row.uuid"
          @click="handleDetail(row.uuid)"
        >
          {{ row.uuid }}
        </DeviceLink>
      </template>
      <template #session="{ row }">
        <DeviceLink
          :uuid="row.session"
          @click="handleDetail(row.uuid, row.session)"
        >
          {{ row.session }}
        </DeviceLink>
      </template>
      <template #expand="{ row }">
        <div style="padding: 0 20px;">
          <span>指纹：</span>
          <span>{{ row.fingerprint }}</span>
        </div>
        <div style="padding: 0 20px;">
          <span>错误类型：</span>
          <span>{{ row.data.name }}</span>
        </div>
        <pre
          style="padding-left: 100px; white-space: break-spaces; word-break: break-word;"
        >{{ row.data.extra }}</pre>
        <pre style="padding-left: 100px; color: var(--el-color-danger);">{{ row.data.stack }}</pre>
      </template>
      <template #error="{ row }">
        {{ `${row.data.name}: ${row.data.message}` }}
      </template>
    </bc-table>

    <UnlimitPagination
      v-model="params"
      @pagination="handleSearch"
    />
  </section>
</template>

<script setup lang="ts">
import IconTips from '@/components/IconTips.vue'
import { ref, shallowRef } from 'vue'
import { getAppErrors } from '@/apis'
import UnlimitPagination from '@/components/UnlimitPagination.vue'
import { useRouter } from 'vue-router'
import DeviceLink from './components/DeviceLink.vue'
import { formatDatetime } from '@/util/tools'

defineOptions({
  name: 'ErrorView',
})

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { type: 'expand' },
  { label: '发生时间', prop: 'device_time', width: 200, filter: formatDatetime },
  { label: '触发地址', prop: 'data.page', width: 200 },
  { label: '会话ID', prop: 'session', width: 220 },
  { label: '设备ID', prop: 'uuid', width: 220 },
  { label: '错误概述', prop: 'error' },
])
const searchConfig = shallowRef([
  { catalog: 'input', name: '会话ID', prop: 'session', width: 300 },
  { catalog: 'input', name: '设备ID', prop: 'uuid', width: 300 },
  { catalog: 'input', name: '指纹', prop: 'fingerprint', width: 300 },
  { catalog: 'datepicker', prop: 'time', type: 'datetimerange' },
])

const router = useRouter()
function handleDetail(id: string, session?: string) {
  router.push({ name: 'DeviceDetail', params: { id }, query: { session } })
}
function getList() {
  return getAppErrors(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
</script>
