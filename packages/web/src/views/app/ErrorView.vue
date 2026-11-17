<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    >
      <template #union>
        <UnionSearch v-model="params" />
      </template>
      <div class="sourcemap-actions">
        <BcButton @click="sourceMapInput?.click()">
          上传 sourcemap
        </BcButton>
        <span
          v-if="sourceMaps.length"
          class="sourcemap-actions__status"
        >
          已加载 {{ sourceMaps.length }} 个（仅当前页面）
        </span>
        <BcButton
          v-if="sourceMaps.length"
          text
          @click="sourceMaps = []"
        >
          清除
        </BcButton>
        <input
          ref="sourceMapInput"
          class="sourcemap-actions__input"
          type="file"
          accept=".map,application/json"
          multiple
          @change="handleSourceMapUpload"
        >
      </div>
    </bc-search>
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
        <ErrorStackSourcemap
          v-if="sourceMaps.length"
          :stack="row.data.stack"
          :source-maps="sourceMaps"
        />
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
import UnionSearch from './components/UnionSearch.vue'
import ErrorStackSourcemap from './components/ErrorStackSourcemap.vue'
import type { LoadedSourceMap } from '@/util/sourcemap'
import { loadSourceMap } from '@/util/sourcemap'
import { ElMessage } from 'element-plus'

defineOptions({
  name: 'ErrorView',
})

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const sourceMapInput = ref<HTMLInputElement>()
const sourceMaps = shallowRef<LoadedSourceMap[]>([])
const tableConfig = shallowRef([
  { type: 'expand' },
  { label: '发生时间', prop: 'device_time', width: 200, filter: formatDatetime },
  { label: '触发地址', prop: 'data.page', width: 200 },
  { label: '会话ID', prop: 'session', width: 220 },
  { label: '设备ID', prop: 'uuid', width: 220 },
  { label: '错误概述', prop: 'error' },
])
const searchConfig = shallowRef([
  { catalog: 'custom', prop: 'union', width: 300 },
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

async function handleSourceMapUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return

  const next = new Map(sourceMaps.value.map(item => [item.key, item]))
  const errors: string[] = []
  for (const file of files) {
    try {
      const sourceMap = await loadSourceMap(file)
      next.set(sourceMap.key, sourceMap)
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  sourceMaps.value = Array.from(next.values())
  input.value = ''

  if (errors.length) {
    ElMessage.warning(errors.join('；'))
  } else {
    ElMessage.success(`已加载 ${files.length} 个 sourcemap`)
  }
}
</script>

<style lang="scss" scoped>
.sourcemap-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sourcemap-actions__status {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.sourcemap-actions__input {
  display: none;
}
</style>
