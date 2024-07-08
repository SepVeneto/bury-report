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
        <ElInput
          v-model="formData.name"
          placeholder="图表名称"
        />
      </ElFormItem>

      <ElFormItem
        label="数据源"
        prop="source"
      >
        <BcSelect
          v-model="formData.source"
          custom-label="name"
          :api="getSourceOptions"
          @change="handleSelectSource"
        />
      </ElFormItem>

      <ElFormItem
        label="统计维度"
        prop="dimension"
      >
        <BcSelect
          v-model="formData.dimension"
          custom-label="name"
          :options="dimensionOptions"
        />
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
    >
      <div style="color: var(--el-color-danger); font-size: 20px; height: 100px; line-height: 100px; text-align: center;">
        {{ error }}
      </div>
    </div>

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
        :disabled="!!error"
        :loading="loading"
        @click="handleSubmit"
      >
        确认
      </ElButton>
    </footer>
  </section>
</template>

<script lang="ts" setup>
import ChartIcon from './components/ChartIcon.vue'
import { computed, ref, shallowRef, watch } from 'vue'
import { useChart, useSteps } from './hooks'
import { source, statistics } from '@/apis'
import type { SourceInfo } from '@/apis/source'
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
  // { label: '折线图', type: 'Line' },
  // { label: '柱状图', type: 'Bar' },
  // { label: '二维表', type: 'Table' },
] as const
const rules = {
  name: { required: true, message: '请设置图表名称' },
  source: { required: true, message: '请选择数据源' },
  dimension: { required: true, message: '请选择统计维度' },
}
const DEFAULT_FORM = {
  sort: 'value',
}
const formData = ref(DEFAULT_FORM as ChartRule)
const error = ref('')
const loading = ref(false)
watch(() => props.data, (val) => {
  if (!val) return
  formData.value = {
    ...DEFAULT_FORM,
    ...val.data,
  }
}, { immediate: true })
const formRef = ref<FormInstance>()
const dimensionOptions = shallowRef<SourceInfo[]>([])

async function handleSelectSource(_: string, item: SourceInfo) {
  const list = await source.options(item.id)
  console.log(list)
  dimensionOptions.value = list
}
function handleSelectChart(chart: typeof type[number]) {
  formData.value.type = chart.type
}
async function handleNext() {
  if (formRef.value) {
    await formRef.value.validate()
  }
  next()
  if (isEnd.value) {
    loading.value = true
    error.value = ''
    try {
      const res = await statistics.preview(formData.value)
      await chart.init()
      chart.setData(res)
    } catch (e) {
      console.error(e)
      error.value = '图表预览失败，请检查配置重新生成'
    } finally {
      loading.value = false
    }
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
