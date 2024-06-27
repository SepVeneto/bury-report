<template>
  <div>
    <ElDescriptions title="设备信息">
      <ElDescriptionsItem
        v-for="(column, index) in deviceInfo"
        :key="index"
        :label="column.label"
      >
        {{ column.filter?.(info[column.prop]) || info[column.prop] }}
      </ElDescriptionsItem>
    </ElDescriptions>

    <ElDescriptions title="系统信息">
      <ElDescriptionsItem
        v-for="(column, index) in systemInfo"
        :key="index"
        :label="column.label"
      >
        {{ info[column.prop] }}
      </ElDescriptionsItem>
    </Eldescriptions>

    <ElDescriptions title="Uni信息">
      <ElDescriptionsItem
        v-for="(column, index) in uniInfo"
        :key="index"
        :label="column.label"
      >
        {{ info[column.prop] }}
      </ElDescriptionsItem>
    </Eldescriptions>

    <ElDescriptions title="浏览器信息">
      <ElDescriptionsItem
        v-for="(column, index) in browserInfo"
        :key="index"
        :label="column.label"
      >
        {{ info[column.prop] }}
      </ElDescriptionsItem>
    </Eldescriptions>
    <ElDescriptions title="客户端信息">
      <ElDescriptionsItem
        v-for="(column, index) in hostInfo"
        :key="index"
        :label="column.label"
      >
        {{ info[column.prop] }}
      </ElDescriptionsItem>
    </Eldescriptions>
  </div>
</template>

<script lang="ts" setup>
import { getAppDevice } from '@/apis'
import { ref } from 'vue'
import { useRoute } from 'vue-router'

function filterDo(val: string): string {
  return {
    portrait: '竖屏',
    landscape: '横屏',
  }[val] || ''
}

const deviceInfo = [
  { label: '设备类型', prop: 'dt' },
  { label: '设备型号', prop: 'dm' },
  { label: '设备方向', prop: 'do', filter: filterDo },
  { label: '设备像素比', prop: 'dp' },
]
const systemInfo = [
  { label: '系统名称', prop: 'on' },
  { label: '系统版本', prop: 'ov' },
]
const uniInfo = [
  { label: '运行平台', prop: 'up' },
  { label: '编译版本', prop: 'uc' },
  { label: '运行版本', prop: 'ur' },
]
const browserInfo = [
  { label: '名称', prop: 'bn' },
  { label: '版本', prop: 'bv' },
  { label: 'ua', prop: 'ua' },
]

const hostInfo = [
  { label: '版本', prop: 'hv' },
  { label: '字体大小', prop: 'hfs' },
  { label: '基础库版本', prop: 'hsdk' },
]

const route = useRoute()

const deviceId = route.query.id as string | undefined

const info = ref({})

deviceId && getAppDevice(deviceId).then(res => {
  info.value = res
})
</script>
