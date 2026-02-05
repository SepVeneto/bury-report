<template>
  <BcSearch
    v-model="params"
    :config="searchConfig"
    :search="handleSearch"
    @reset="params.session = undefined"
  />
  <BcTable
    ref="tableRef"
    v-model="params"
    :config="tableConfig"
    :api="getList"
    pagination
  >
    <template #session="{ row }">
      <DeviceLink
        :uuid="row.session"
        @click="handleOpen(row)"
      />
    </template>
    <template #operate="{ row }">
      <BcButton
        text
        type="primary"
        @click="handleSync(row.session)"
      >
        同步
      </BcButton>
    </template>
  </BcTable>

  <ElDialog
    v-model="session.show"
    destroy-on-close
    style="min-height: 700px;"
  >
    <SessionH5
      v-if="type === 'web'"
      :session="session.id"
    />
    <SessionMp
      v-if="type === 'mp-weixin'"
      :session="session.id"
    />
  </ElDialog>
</template>

<script lang="ts" setup>
import SessionH5 from './components/SessionH5.vue'
import SessionMp from './components/SessionMp.vue'
import { getSessionList, syncSession } from '@/apis'
import { ref, shallowRef, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'
import DeviceLink from './components/DeviceLink.vue'

defineProps<{ type?: string }>()
const route = useRoute()
const refTable = useTemplateRef('tableRef')

const deviceId = route.params.id as string
const params = ref<{ session?: string, page: number, size: number }>({
  page: 1,
  size: 20,
})
const searchConfig = shallowRef([
  { catalog: 'input', prop: 'session', name: '会话ID' },
])
const tableConfig = shallowRef([
  { label: '会话', prop: 'session' },
  { label: '时间', prop: 'create_time' },
  { label: '操作', prop: 'operate' },
])

if (route.query.session) {
  params.value.session = route.query.session as string
}

function handleSync(session: string) {
  syncSession(session)
}

function handleSearch() {
  params.value.page = 1
  // @ts-expect-error: ignore
  refTable.value?.getList()
}
function getList() {
  return getSessionList(deviceId, params.value)
}

const session = ref({
  show: false,
  id: '',
})

async function handleOpen(row: any) {
  session.value = {
    show: true,
    id: row.session,
  }
}
</script>

<style lang="scss" scoped>
:global(.rr-player) {
  box-shadow: none;
}
.api-item {
  display: flex;
  white-space: wrap;
  word-break: break-all;
  color: gray;
  &.active {
    color: black;
  }
}
.log-stamp {
  flex-shrink: 0;
  width: 60px;
}
</style>
