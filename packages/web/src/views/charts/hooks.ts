import { computed, nextTick, ref } from 'vue'
import { unrefElement } from '@vueuse/core'
import type { Ref } from 'vue'
import type { EChartsType } from 'echarts'

export function useSteps() {
  const active = ref(0)
  const showNext = computed(() => active.value < max)
  const showPrevious = computed(() => active.value > 0)
  const isEnd = computed(() => active.value === max)
  const STEPS = ['类型选择', '参数配置', '预览']
  const max = STEPS.length - 1

  function next() {
    active.value = Math.min(max, active.value + 1)
  }
  function previous() {
    active.value = Math.max(0, active.value - 1)
  }
  return {
    STEPS,
    active,
    showNext,
    showPrevious,
    isEnd,
    next,
    previous,
  }
}

export function useChart(dom: Ref<HTMLElement | undefined>, _config: any) {
  const load = () => import('echarts')
  const echart = load()
  let chart: EChartsType

  async function init() {
    await nextTick()
    const container = unrefElement(dom)
    chart = (await echart).init(container)
  }

  function setData(data: any[]) {
    console.log('set', chart)
    chart.setOption({
      tooltip: {
        trigger: 'item',
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 10,
        top: 20,
        bottom: 20,
      },
      series: [
        {
          type: 'pie',
          data,
        },
      ],
    })
  }
  return {
    init,
    setData,
  }
}
