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
      pagination
      :api="getList"
    >
      <template #responseStatus="{ row }">
        <StatusIcon :code="row.data.status" />
      </template>
      <template #expand="{ row }">
        <div style="padding: 20px;">
          <ElCollapse>
            <ElCollapseItem title="常规">
              <ElDescriptions :column="1">
                <ElDescriptionsItem label="请求URL">
                  {{ row.data.url }}
                </ElDescriptionsItem>
                <ElDescriptionsItem label="请求方法">
                  {{ row.data.method }}
                </ElDescriptionsItem>
                <ElDescriptionsItem label="状态代码">
                  <StatusIcon :code="row.data.status" />
                </ElDescriptionsItem>
                <ElDescriptionsItem label="发起地址">
                  {{ row.data.page }}
                </ElDescriptionsItem>
              </ElDescriptions>
            </ElCollapseItem>

            <ElCollapseItem title="请求参数">
              <JsonViewer :value="JSON.parse(row.data.body)" />
            </ElCollapseItem>

            <ElCollapseItem title="响应标头">
              <pre>{{ row.data.responseHeaders }}</pre>
            </ElCollapseItem>

            <ElCollapseItem title="响应">
              <JsonViewer :value="JSON.parse(row.data.response)" />
            </ElCollapseItem>
          </ElCollapse>
        </div>
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { getAppNetworks } from '@/apis'
import StatusIcon from '@/components/statusIcon.vue'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { JsonViewer } from 'vue3-json-viewer'
import 'vue3-json-viewer/dist/index.css'

const params = ref({
  page: 1,
  size: 10,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { type: 'expand' },
  { label: '发生时间', prop: 'device_time', width: 200 },
  { label: '设备ID', prop: 'uuid', width: 200 },
  { label: '请求', prop: 'data.url' },
  { label: '方法', prop: 'data.method' },
  { label: '发起地址', prop: 'data.page' },
  { label: '时间', prop: 'data.duration' },
  { label: '响应状态', prop: 'responseStatus' },
])
const searchConfig = shallowRef([
  { catalog: 'input', name: '设备ID', prop: 'uuid', width: 300 },
  { catalog: 'input', name: '接口', prop: 'url', width: 300 },
  { catalog: 'input', name: '发起地址', prop: 'send_page', width: 300 },
  { catalog: 'input', name: '请求参数', prop: 'payload', width: 300 },
  { catalog: 'input', name: '响应内容', prop: 'response', width: 300 },
  {
    catalog: 'select',
    name: '响应状态',
    prop: 'status',
    options: [200, 500, 502, 404],
    allowCreate: true,
    filterable: true,
    width: 300,
  },
  { catalog: 'datepicker', prop: 'time', type: 'datetimerange' },
])

function getList() {
  return getAppNetworks(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
</script>
