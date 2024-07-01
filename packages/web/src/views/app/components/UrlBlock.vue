<template>
  <div>
    <div class="block-path">
      {{ blockApi[1] }}
    </div>
    <div class="block-domain">
      {{ blockApi[0] }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps({
  url: {
    type: [Array, String],
    required: true,
  },
})
const normalizeUrl = computed(() => {
  // 兼容微信老数据
  if (Array.isArray(props.url)) {
    return props.url.join(',')
  } else {
    return props.url
  }
})
const urlReg = /(?<suffix>https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\.?)(?<api>.*)/
const blockApi = computed(() => {
  const { groups } = normalizeUrl.value.match(urlReg) || { groups: null }
  if (!groups) {
    return ['', props.url]
  } else {
    return [groups.suffix, groups.api]
  }
})
</script>

<style scoped>
.block-domain {
  font-size: 12px;
  color: var(--el-color-info);
}
</style>
