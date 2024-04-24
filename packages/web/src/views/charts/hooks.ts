import { computed, ref } from 'vue'

export function useSteps(max: number) {
  const active = ref(0)
  const showNext = computed(() => active.value < max - 1)
  const showPrevious = computed(() => active.value > 0)
  const isEnd = computed(() => active.value === max - 1)

  function next() {
    active.value = Math.min(max, active.value + 1)
  }
  function previous() {
    active.value = Math.max(0, active.value - 1)
  }
  return {
    active,
    showNext,
    showPrevious,
    isEnd,
    next,
    previous,
  }
}
