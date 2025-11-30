<template>
  <BcTable
    :config="tableConfig"
    :api="getList"
    pagination
  >
    <template #session="{ row }">
      <BcButton
        text
        type="primary"
        @click="handleOpen(row)"
      >
        {{ row.session }}
      </BcButton>
    </template>
  </BcTable>

  <ElDrawer
    v-model="show"
    size="80%"
    @opened="onOpened"
  >
    <div ref="player" />
  </ElDrawer>
</template>

<script lang="ts" setup>
import { getSessionDetail, getSessionEvents, getSessionList } from '@/apis'
import { ref, shallowRef, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'
import RrwebPlayer from 'rrweb-player'
import 'rrweb-player/dist/style.css'

const route = useRoute()
const playerRef = useTemplateRef('player')

const deviceId = route.params.id as string
const params = ref({
  page: 1,
  size: 20,
})
const tableConfig = shallowRef([
  { label: '会话', prop: 'session' },
  { label: '时间', prop: 'create_time' },
])
const show = ref(false)

function getList() {
  return getSessionList(deviceId, params.value)
}
const events = shallowRef([])
function handleOpen(row) {
  show.value = true
  getSessionEvents(row.id).then(res => {
    console.log(res)
  })
}

function onOpened() {
  if (!playerRef.value) {
    return
  }
  const player = new RrwebPlayer({
    target: playerRef.value,
    props: {
      events: [],
    },
  })
}
</script>
