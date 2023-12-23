import { nextTick, Ref, watch } from 'vue'
export function useWatchValidate(formRef: Ref<any>, model: any, key: string, ) {
  watch(() => model.value[key], () => {
    nextTick(() => {
      formRef.value.validateField(key)
    })
  })
}