import { useCharts } from './useCharts'

export function useLine(dom: string | HTMLElement, title: string) {
  const chart = useCharts(dom, {})

  function updateConfig(xAxis: string[], value: number[]) {
    chart.setOption({
      title: {
        text: title,
      },
      xAxis: {
        data: xAxis,
      },
      tooltip: {
        trigger: 'axis',
      },
      yAxis: {},
      series: [
        {
          name: '打开次数',
          type: 'line',
          data: value,
        },
      ],
    })
  }

  return {
    updateConfig,
  }
}
