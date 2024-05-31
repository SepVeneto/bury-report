<template>
  <section>
    <ElSteps :active="active">
      <ElStep
        v-for="step in STEPS"
        :key="step"
        :title="step"
      />
    </ElSteps>

    <div
      v-if="active === 0"
      style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; padding: 10px;"
    >
      <ChartIcon
        v-for="(item, index) in type"
        :key="index"
        :disabled="isEdit"
        v-bind="item"
        :active="item.type === formData.type"
        @click="!isEdit && handleSelectChart(item)"
      />
    </div>

    <ElForm
      v-else-if="active === 1"
      ref="formRef"
      :model="formData"
      label-width="100px"
      :rules="rules"
      style="width: 300px;"
    >
      <ElFormItem
        label="名称"
        prop="name"
      >
        <ElInput v-model="formData.name" />
      </ElFormItem>

      <ElFormItem
        label="数据源"
        prop="source"
      >
        <BcSelect
          v-model="formData.source"
          custom-label="name"
          :api="getSourceOptions"
        />
      </ElFormItem>

      <ElFormItem
        label="统计维度"
        prop="dimension"
      >
        <BcInput v-model="formData.dimension" />
      </ElFormItem>

      <ElFormItem
        label="排序"
        prop="sort"
      >
        <ElRadioGroup v-model="formData.sort">
          <ElRadio value="value">
            按值
          </ElRadio>
          <ElRadio value="name">
            按名称
          </ElRadio>
        </ElRadioGroup>
      </ElFormItem>
    </ElForm>

    <div
      v-else-if="active === 2"
      ref="chartRef"
      style="width: 100%; height: 300px;"
    />

    <footer style="text-align: right;">
      <ElButton @click="$emit('close')">
        取消
      </ElButton>
      <ElButton
        v-if="showPrevious"
        @click="previous()"
      >
        上一步
      </ElButton>
      <ElButton
        v-if="showNext"
        :disabled="!formData.type"
        @click="handleNext"
      >
        下一步
      </ElButton>
      <ElButton
        v-if="isEnd"
        @click="handleSubmit"
      >
        确认
      </ElButton>
    </footer>
  </section>
</template>

<script lang="ts" setup>
import ChartIcon from './components/ChartIcon.vue'
import { computed, ref, watch } from 'vue'
import { useChart, useSteps } from './hooks'
import { source, statistics } from '@/apis'
import type { FormInstance } from 'element-plus'
import type { ChartRule } from '@/apis/statistics'

const emit = defineEmits<{
  close: [],
  submit: [],
}>()
const props = defineProps({
  data: {
    type: Object,
    default: () => ({}),
  },
})

const isEdit = computed(() => {
  return !!props.data.id
})

const chartRef = ref<HTMLElement>()
const chart = useChart(chartRef, {})
const {
  STEPS,
  active,
  showNext,
  showPrevious,
  isEnd,
  next,
  previous,
} = useSteps()
const type = [
  { label: '饼图', type: 'Pie' },
  { label: '折线图', type: 'Line' },
  { label: '柱状图', type: 'Bar' },
  { label: '二维表', type: 'Table' },
] as const
const rules = {
  source: { required: true, message: '请选择数据源' },
}
const formData = ref({
  sort: 'value',
} as ChartRule)
watch(() => props.data, (val) => {
  if (!val) return
  formData.value = { ...val.data }
}, { immediate: true })
const formRef = ref<FormInstance>()

function handleSelectChart(chart: typeof type[number]) {
  formData.value.type = chart.type
}
async function handleNext() {
  if (formRef.value) {
    await formRef.value.validate()
  }
  next()
  if (isEnd.value) {
    chart.init()
    const res = await statistics.preview(formData.value)
    chart.setData(res)
  }
}
function getSourceOptions() {
  return source.options()
}
async function handleSubmit() {
  if (props.data.id) {
    await statistics.update(props.data.id, formData.value)
  } else {
    await statistics.create(formData.value)
  }
  emit('submit')
}
</script>
