<template>
  <section style="display: flex;">
    <ElCard shadow="never">
      <template #header>
        <header style="display: flex;">
          <ElInput v-model="search" />
          <ElButton
            style="margin-left: 20px;"
            :icon="IconPlus"
            type="primary"
            @click="handleCreate"
          />
        </header>
      </template>
      <div
        v-for="(item, index) in list"
        :key="index"
      >
        <div
          class="chart-title"
          :class="[active === item.id && 'active']"
          @click="handleSelect(item)"
        >
          <span>{{ item.data.name }}</span>
          <div class="operate">
            <BcButton
              :icon="IconEdit"
              text
              @click="handleEdit(item)"
            />
            <BcButton
              confirm
              :icon="IconDelete"
              type="danger"
              text
              @click="handleDelete(item)"
            />
          </div>
        </div>
      </div>
    </ElCard>

    <div
      ref="chartRef"
      style="flex: 1; height: calc(100vh - var(--topbar-height) - var(--breadcrumb-height) - 106px)"
    />

    <BcDialog
      v-model="visible"
      title="创建图表"
      destroy-on-close
      no-footer
    >
      <EditChart
        :data="editData"
        @submit="visible = false; init()"
        @close="visible = false"
      />
    </BcDialog>
  </section>
</template>

<script lang="ts" setup>
import { statistics } from '@/apis'
import EditChart from './EditChart.vue'
import { Delete as IconDelete, Edit as IconEdit, Plus as IconPlus } from '@element-plus/icons-vue'
import { onMounted, ref } from 'vue'
import { useChart } from './hooks'
import type { Record } from '@/apis/statistics'

const chartRef = ref<HTMLElement>()
const chart = useChart(chartRef, {})
const list = ref<Record[]>([])
const search = ref('')
const visible = ref(false)
const active = ref()
const editData = ref({})

init()

onMounted(() => {
  chart.init()
})

async function handleSelect(record: Record) {
  active.value = record.id
  const res = await statistics.chart(record.id)
  chart.setData(res)
}
async function init() {
  list.value = await statistics.list()
}
function handleCreate() {
  visible.value = true
}
function handleEdit(record: Record) {
  editData.value = record
  visible.value = true
}
async function handleDelete(record: Record) {
  await statistics.del(record.id)
  init()
}
</script>

<style lang="scss" scoped>
.chart-title {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  transition: all 0.2s;
  .operate {
    opacity: 0;
    transition: opacity 0.2s;
  }
  &:hover {
    background: var(--el-fill-color-light);
    .operate {
      opacity: 1;
    }
  }
  &.active {
    background: var(--el-color-primary-light-9);
  }
}
</style>
