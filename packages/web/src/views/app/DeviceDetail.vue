<template>
  <ElTabs v-model="active">
    <ElTabPane
      label="设备信息"
      name="device"
    >
      <div style="position: relative;">
        <ElSkeleton
          :loading="!info"
        >
          <template
            v-if="!!info"
            #default
          >
            <ElDescriptions
              title="设备信息"
              :column="1"
            >
              <ElDescriptionsItem
                v-for="(column, index) in deviceInfo"
                :key="index"
                :label="column.label"
              >
                <img
                  v-if="column.prop === 'dt'"
                  style="width: 32px; height: 32px; display: inline-block;"
                  :title="info[column.prop]"
                  :alt="info[column.prop]"
                  :src="filterDtIcon(info[column.prop])"
                >
                <span v-else>
                  {{ 'filter' in column && column.filter(info[column.prop]) || info[column.prop] }}
                </span>
              </ElDescriptionsItem>
            </ElDescriptions>

            <ElDescriptions
              title="系统信息"
              :column="1"
            >
              <ElDescriptionsItem
                v-for="(column, index) in systemInfo"
                :key="index"
                :label="column.label"
              >
                <img
                  v-if="column.prop === 'on'"
                  style="width: 32px; height: 32px; display: inline-block;"
                  :title="info[column.prop]"
                  :alt="info[column.prop]"
                  :src="filterOnIcon(info[column.prop])"
                >
                <span v-else>
                  {{ info[column.prop] }}
                </span>
              </ElDescriptionsItem>
            </ElDescriptions>

            <ElDescriptions
              title="Uni信息"
              :column="1"
            >
              <ElDescriptionsItem
                v-for="(column, index) in uniInfo"
                :key="index"
                :label="column.label"
              >
                <img
                  v-if="column.prop === 'up'"
                  style="width: 32px; height: 32px; display: inline-block;"
                  :title="info[column.prop]"
                  :alt="info[column.prop]"
                  :src="filterUpIcon(info[column.prop])"
                >
                <span v-else>{{ info[column.prop] }}</span>
              </ElDescriptionsItem>
            </ElDescriptions>

            <ElDescriptions
              v-if="isBrowser"
              title="浏览器信息"
              :column="1"
            >
              <ElDescriptionsItem
                v-for="(column, index) in browserInfo"
                :key="index"
                :label="column.label"
              >
                <img
                  v-if="column.prop === 'bn'"
                  style="width: 32px; height: 32px; display: inline-block;"
                  :title="info[column.prop]"
                  :alt="info[column.prop]"
                  :src="filterBnIcon(info[column.prop])"
                >
                <span v-else>{{ info[column.prop] }}</span>
              </ElDescriptionsItem>
            </ElDescriptions>

            <ElDescriptions
              v-if="info.hsdk"
              title="客户端信息"
              :column="1"
            >
              <ElDescriptionsItem
                v-for="(column, index) in hostInfo"
                :key="index"
                :label="column.label"
              >
                {{ info[column.prop] }}
              </ElDescriptionsItem>
            </ElDescriptions>

            <DeviceScreen
              style="position: absolute; right: 0; top: 0; transform: scale(0.5); transform-origin: top right;"
              :width="info.sw"
              :height="info.sh"
              :screen="[info.wt, info.wb, info.ww, info.wh]"
              :status="info.sbh"
            />
          </template>
        </ElSkeleton>
      </div>
    </ElTabPane>

    <ElTabPane
      label="会话记录"
      name="session"
    >
      <DeviceSession
        :type="info?.up"
      />
    </ElTabPane>
  </ElTabs>
</template>

<script lang="ts" setup>
import DeviceSession from './DeviceDetail.session.vue'
import IconPad from './assets/pad.svg'
import IconPc from './assets/pc.svg'
import IconPhone from './assets/phone.svg'
import IconAndroid from './assets/android.svg'
import IconIos from './assets/ios.svg'
import IconWindows from './assets/windows.svg'
import IconLinux from './assets/linux.svg'
import IconWeb from './assets/web.svg'
import IconWeixin from './assets/weixin.svg'
import IconEdge from './assets/edge.svg'
import IconChrome from './assets/chrome.svg'
import IconFirefox from './assets/firefox.svg'
import IconSafari from './assets/safari.svg'
import IconUnknown from './assets/unknown.svg'
import DeviceScreen from './components/DeviceScreen.vue'

import type { DeviceInfo } from '@/apis'
import { getAppDevice } from '@/apis'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const active = ref('device')

function filterModel(dm: DeviceInfo['dm']) {
  if (info.value?.db) {
    return `${info.value.db}/${dm}`
  } else {
    return dm
  }
}
function filterDo(val: string): string {
  return {
    portrait: '竖屏',
    landscape: '横屏',
  }[val] || val
}
function filterDtIcon(dt: DeviceInfo['dt']) {
  return {
    pc: IconPc,
    phone: IconPhone,
    pad: IconPad,
  }[dt.toLowerCase()] || IconUnknown
}
function filterOnIcon(on: DeviceInfo['on']) {
  return {
    android: IconAndroid,
    ios: IconIos,
    mac: IconIos,
    windows: IconWindows,
    linux: IconLinux,
  }[on.toLowerCase()] || IconUnknown
}
function filterUpIcon(up: DeviceInfo['up']) {
  return {
    web: IconWeb,
    'mp-weixin': IconWeixin,
  }[up] || IconUnknown
}
function filterBnIcon(bn: DeviceInfo['bn']) {
  return {
    edge: IconEdge,
    chrome: IconChrome,
    firefox: IconFirefox,
    safari: IconSafari,
  }[bn.toLowerCase()] || IconUnknown
}

const deviceInfo = [
  { label: '访问IP', prop: 'ip' },
  { label: '设备类型', prop: 'dt' },
  { label: '设备型号', prop: 'dm', filter: filterModel },
  { label: '设备方向', prop: 'do', filter: filterDo },
  { label: '设备像素比', prop: 'dp' },
] as const
const systemInfo = [
  { label: '系统名称', prop: 'on' },
  { label: '系统版本', prop: 'ov' },
] as const
const uniInfo = [
  { label: '运行平台', prop: 'up' },
  { label: '编译版本', prop: 'uc' },
  { label: '运行版本', prop: 'ur' },
] as const
const browserInfo = [
  { label: '名称', prop: 'bn' },
  { label: '版本', prop: 'bv' },
  { label: 'ua', prop: 'ua' },
] as const

const hostInfo = [
  { label: '版本', prop: 'hv' },
  { label: '字体大小', prop: 'hfs' },
  { label: '基础库版本', prop: 'hsdk' },
] as const

const route = useRoute()

if (route.query.session) {
  active.value = 'session'
}

const deviceId = route.params.id as string | undefined

const info = ref<DeviceInfo>()
const isBrowser = computed(() => info.value?.up === 'web')

if (deviceId) {
  getAppDevice(deviceId).then(res => {
    info.value = res
  })
}
</script>
