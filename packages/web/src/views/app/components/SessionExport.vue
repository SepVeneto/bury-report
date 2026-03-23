<template>
  <section
    v-if="!session.inited.value"
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
  <section v-else>
    <ElProgress
      :percentage="exportState.progress * 100"
      :stroke-width="24"
      :indeterminate="exportState.indeterminate"
      :status="exportState.status"
    >
      <template #default="{ percentage }">
        <span>{{ percentage.toFixed(2) }}%</span>
        <span>{{ exportState.text }}</span>
      </template>
    </ElProgress>
  </section>
</template>

<script lang="ts" setup>
import * as MP4Box from 'mp4box'
import { useH5Session } from './composable'
import { exportSession } from '@/apis'
import { shallowRef } from 'vue'

const props = defineProps({
  session: {
    type: String,
    required: true,
  },
})

const session = useH5Session(props.session, handleExport)
session.getDetail()
const exportState = shallowRef({
  text: '等待中',
  progress: 0,
  indeterminate: false,
  status: '',
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
    // @ts-expect-error: ignore
    const avc = mp4file.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0].avcC

    const stream = new MP4Box.DataStream()
    // @ts-expect-error: ignore
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
  let currentOffset = 0
  await exportSession(props.session, (msg) => {
    const data = JSON.parse(msg.data)
    switch (data.action) {
      case 'generate': {
        exportState.value = {
          text: '正在导出视频',
          progress: data.progress,
          indeterminate: false,
          status: '',
        }
        break
      }
      case 'transform': {
        exportState.value = {
          text: '正在转换成MP4',
          progress: 1,
          indeterminate: true,
          status: 'warning',
        }
        data.chunks.forEach((chunk: any) => {
          const u8 = new Uint8Array(chunk.data)
          const buffer = u8.buffer as MP4Box.MP4BoxBuffer
          buffer.fileStart = currentOffset
          mp4file.appendBuffer(buffer)
          currentOffset += buffer.byteLength
        })
      }
    }
    console.log(msg)
  })

  mp4file.flush()

  const total = lastDTS + lastSampleDuration
  const movieTimescale = outMp4.moov.mvhd.timescale
  outMp4.moov.mvhd.duration = total / 12800 * movieTimescale

  const trak = outMp4.getTrackById(videoTrackId)
  trak.tkhd.duration = outMp4.moov.mvhd.duration
  trak.mdia.mdhd.duration = total

  outMp4.save(`${props.session}.mp4`)
  exportState.value = {
    text: '导出完成',
    progress: 1,
    indeterminate: false,
    status: 'success',
  }
}

async function handleSync() {
  session.sync()
}
</script>
