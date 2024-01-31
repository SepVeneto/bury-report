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
    />
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { getAppLogs } from '@/apis'
import { useRoute } from 'vue-router'

const deviceOptions = [
  { label: '苹果', value: 'ios' },
  { label: '安卓', value: 'android' },
]
const platformOptions = [
  { label: '微信小程序', value: 'mp-weixin' },
  { label: 'Web', value: 'h5' },
]
const route = useRoute()
const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '记录时间', prop: 'create_time', filter: (str: string) => new Date(str).toLocaleString(), width: 160 },
  {
    label: '设备信息',
    children: [
      { label: 'ID', prop: 'data.uuid', width: 200 },
      { label: '类型', prop: 'data.on', filter: (str: 'android' | 'ios') => str === 'ios' ? '苹果' : '安卓' },
      { label: '品牌', prop: 'data.db' },
      { label: '型号', prop: 'data.dm' },
      { label: '系统版本', prop: 'data.ov' },
    ],
  },
  {
    label: '宿主信息',
    children: [
      { label: '平台', prop: 'data.up', filter: (str: string) => str === 'mp-weixin' ? '微信小程序' : '浏览器' },
      { label: '版本', prop: 'data.hv' },
      { label: '基础库版本', prop: 'data.hsdk' },
    ],
  },
  {
    label: '应用信息',
    children: [
      { label: 'uni编译器版本', prop: 'data.uc' },
      { label: 'uni运行时版本', prop: 'data.ur' },
    ],
  },

])
const searchConfig = shallowRef([
  { catalog: 'input', name: '设备ID', prop: 'deviceId' },
  { catalog: 'select', name: '设备类型', options: deviceOptions, prop: 'deviceType' },
  { catalog: 'input', name: '设备品牌', prop: 'deviceBrand' },
  { catalog: 'input', name: '设备型号', prop: 'deviceModel' },
  { catalog: 'select', name: '宿主平台', prop: 'hostPlatform', options: platformOptions },
  { catalog: 'datepicker', prop: 'timerange', type: 'datetimerange' },
])

function getList() {
  return getAppLogs(route.params.id as string, params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
</script>
