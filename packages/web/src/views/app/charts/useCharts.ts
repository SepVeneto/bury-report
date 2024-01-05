import { init } from 'echarts'
import type { EChartsOption } from 'echarts'

export function useCharts(dom: string | HTMLElement, options: EChartsOption) {
  const node: HTMLElement = typeof dom === 'string' ? document.querySelector(dom) : dom
  const chart = init(node, options)
  return chart
}
