import { useCharts } from './useCharts'

export function usePie(dom: string | HTMLElement, title: string) {
  const chart = useCharts(dom, {})

  function updateConfig(data: any) {
    chart.setOption({
      title: {
        text: title,
      },
      tooltip: { trigger: 'item' },
      series: {
        name: '数量',
        type: 'pie',
        radius: '50%',
        data,
      },
    })
  }
  return {
    updateConfig,
  }
}
