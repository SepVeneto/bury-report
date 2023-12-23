<template>
  <el-switch
    active-text="启用"
    inactive-text="禁用"
    inline-prompt
    :width="56"
    :active-value="Status.Enable"
    :inactive-value="Status.Disable"
    v-bind="$attrs"
  />
</template>

<script lang="ts">
import { Status } from '@/util/enum'
import { defineComponent } from 'vue'
export default defineComponent({
  name: 'RxSwitch',
  setup() {
    return {
      Status,
    }
  }
})
</script>
