<template>
  <section
    v-if="session.inited.value"
    style="display: flex;"
  >
    <BcButton @click="handleExport">
      导出
    </BcButton>
    <div style="width: 500px;">
      <div ref="refPlayer" />
    </div>
    <ElTabs
      type="card"
      model-value="net"
    >
      <ElTabPane
        name="net"
        label="网络"
      >
        <ElScrollbar
          height="700px"
          style="flex: 1;"
        >
          <ElCollapse>
            <ElCollapseItem
              v-for="(api, index) in apis"
              :key="index"
            >
              <template #title>
                <div
                  class="api-item"
                  :class="[isActiveApi(api) && 'active']"
                >
                  <span class="log-stamp">[{{ timeFormat(api.stamp) }}]</span>
                  <span>{{ simpleUrl(api) }}</span>
                </div>
              </template>
              <ElDescriptions :column="1">
                <ElDescriptionsItem label="请求URL">
                  {{ api.data.url }}
                </ElDescriptionsItem>
                <ElDescriptionsItem label="状态">
                  {{ api.data.status }}
                </ElDescriptionsItem>
                <ElDescriptionsItem label="耗时">
                  {{ api.data.duration?.toFixed(2) || '--' }}ms
                </ElDescriptionsItem>
              </ElDescriptions>
            </ElCollapseItem>
          </ElCollapse>
        </ElScrollbar>
      </ElTabPane>

      <ElTabPane
        name="log"
        label="日志"
      >
        <ElScrollbar
          height="700px"
          style="flex: 1;"
        >
          <div
            v-for="(log, index) in logs"
            :key="index"
          >
            <div
              class="api-item"
              :class="[isActiveApi(log) && 'active']"
            >
              <div class="log-stamp">
                [{{ timeFormat(log.stamp) }}]
              </div>
              <div>{{ JSON.stringify(log.data) }}</div>
            </div>
          </div>
        </ElScrollbar>
      </ElTabPane>

      <ElTabPane
        name="error"
        label="错误"
      >
        <ElScrollbar
          height="700px"
          style="flex: 1;"
        >
          <div
            v-for="(err, index) in errs"
            :key="index"
          >
            <div
              class="api-item"
              :class="[isActiveApi(err) && 'active']"
            >
              <div class="log-stamp">
                [{{ timeFormat(err.stamp) }}]
              </div>
              <div>{{ `${err.data.name}: ${JSON.stringify(err.data.message)}` }}</div>
            </div>
          </div>
        </ElScrollbar>
      </ElTabPane>
    </ElTabs>
  </section>
  <section
    v-else
    style="display: flex; flex-direction: column;"
  >
    <ElEmpty description="暂无数据，请手动同步或一段时间后查询" />
    <div style="text-align: center;">
      <BcButton
        v-if="!session.isSyncing.value"
        type="primary"
        @click="handleSync"
      >
        同步
      </BcButton>
      <BcButton
        v-else
        type="info"
        loading
      >
        同步中
      </BcButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import RrwebPlayer from 'rrweb-player'
import 'rrweb-player/dist/style.css'
import { EventType } from '@rrweb/types'
import { type SessionApi, type SessionLog, exportSession } from '@/apis'
import { onMounted, onUnmounted, ref, shallowRef, useTemplateRef } from 'vue'
import { useH5Session } from './composable'
import * as MP4Box from 'mp4box'

const playerRef = useTemplateRef('refPlayer')
const currentStamp = ref(0)

const apis = shallowRef<SessionApi[]>([])
const logs = shallowRef<SessionLog[]>([])
const errs = shallowRef<SessionLog[]>([])
const player = shallowRef<RrwebPlayer>()
let startTime = 0

const props = defineProps({
  session: {
    type: String,
    required: true,
  },
})
const session = useH5Session(props.session, onOpened)

onMounted(async () => {
  const res = await session.getDetail()
  apis.value = res.net
  logs.value = res.log
  errs.value = res.err
  apis.value.sort((a, b) => a.stamp - b.stamp)
  logs.value.sort((a, b) => a.stamp - b.stamp)
  errs.value.sort((a, b) => a.stamp - b.stamp)
  // nextTick().then(() => {
  //   onOpened()
  // })
})

onUnmounted(() => {
  onClosed()
})

async function handleExport() {
  const mp4file = MP4Box.createFile()
  const outMp4 = MP4Box.createFile()
  mp4file.onError = (err) => {
    console.log('error', err)
  }

  let videoTrackId = -1
  let lastDTS = 0
  let lastSampleDuration = 0
  mp4file.onReady = (info) => {
    const track = info.tracks[0]
    console.log('export', info, mp4file.getTrackById(track.id))
    const avc = mp4file.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0].avcC

    const stream = new MP4Box.DataStream()
    stream.endianness = false
    avc.write(stream)
    const fullBuffer = stream.buffer
    const configRecord = fullBuffer.slice(8)

    videoTrackId = outMp4.addTrack({
      timescale: track.timescale,
      width: track.video?.width,
      height: track.video?.height,
      type: 'avc1',
      avcDecoderConfigRecord: configRecord,
    })

    mp4file.setExtractionOptions(track.id, null, { nbSamples: 1 })
    mp4file.start()
  }

  mp4file.onSamples = (id, user, samples) => {
    console.log('set samples')
    samples.forEach(s => {
      lastDTS = s.dts
      lastSampleDuration = s.duration

      outMp4.addSample(videoTrackId, s.data!, {
        duration: s.duration,
        dts: s.dts,
        cts: s.cts,
        is_sync: s.is_sync,
      })
    })
  }
  const chunks: any[] = []
  let currentOffset = 0
  await exportSession(props.session, (msg) => {
    const data = JSON.parse(msg.data)
    switch (data.action) {
      case 'transform': {
        data.chunks.forEach((chunk) => {
          const u8 = new Uint8Array(chunk.data)
          // safeAppend(mp4file, u8)
          const buffer = u8.buffer as MP4Box.MP4BoxBuffer
          buffer.fileStart = currentOffset
          mp4file.appendBuffer(buffer)
          currentOffset += buffer.byteLength
          console.log(currentOffset, buffer.byteLength)
          // chunks.push(new Uint8Array(chunk.data))
        })
      }
    }
    console.log(msg)
  })

  console.log('flush')
  mp4file.flush()

  const total = lastDTS + lastSampleDuration
  // if (outMp4.moov) {
  const movieTimescale = outMp4.moov.mvhd.timescale
  outMp4.moov.mvhd.duration = total / 12800 * movieTimescale

  const trak = outMp4.getTrackById(videoTrackId)
  trak.tkhd.duration = outMp4.moov.mvhd.duration
  trak.mdia.mdhd.duration = total
  // }

  outMp4.save('output.mp4')
  return

  const b = mp4file.getBuffer()
  console.log(b)

  const blob = new Blob([b], { type: 'video/mp4' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'output.mp4'
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
  a.remove()
}

async function handleSync() {
  session.sync()
}
function onClosed() {
  player.value?.getReplayer().destroy()
}
async function onOpened() {
  if (!playerRef.value || !session.inited.value) {
    return
  }
  const events = await session.events.value
  startTime = events[0].timestamp
  player.value = new RrwebPlayer({
    target: playerRef.value,
    props: {
      width: 500,
      height: 500,
      events,
      // plugins: [{
      //   handler(event, isSync, context) {
      //     if (event.type === '')
      //   }
      // }]
    },
  })
  player.value.addEventListener('custom-event', (evt) => {
    console.log('custom', evt)
  })
  player.value.addEventListener('event-cast', (evt) => {
    switch (evt.type) {
      case EventType.Plugin: {
        if (evt.data.plugin === '@sepveneto/enhanced') {
          switch (evt.data.payload.event) {
            case 'visibilitychange': {
              console.log(evt.data.payload.action)
            }
          }
        }
      }
    }
  })
  player.value.addEventListener('ui-update-current-time', (evt) => {
    currentStamp.value = evt.payload
  })
}

function simpleUrl(api: SessionApi) {
  if (!api.data.url) {
    return api.data.type
  }
  const url = new URL(api.data.url)
  return url.pathname
}

function timeFormat(stamp?: number) {
  if (!stamp) return '--:--'

  const flag = stamp > startTime
  const offset = Math.abs(stamp - startTime)
  const seconds = Math.floor(offset / 1000)
  const minutes = Math.floor(seconds / 60)

  return `${flag ? '' : '-'}${addZero(minutes)}:${addZero(seconds % 60)}`
}

function addZero(num: number) {
  return num < 10 ? `0${num}` : num
}

function isActiveApi(api: SessionApi) {
  const offset = api.stamp - startTime
  return currentStamp.value >= offset
}
</script>
