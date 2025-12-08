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
import type { PropType } from 'vue'
import { computed } from 'vue'

const props = defineProps({
  simple: Boolean,
  url: {
    type: [Array, String] as PropType<string[] | string>,
    required: true,
  },
})
const normalizeUrl = computed(() => {
  // 兼容微信老数据
  if (Array.isArray(props.url)) {
    return props.url.map(item => simpleUrl(item)).join(',')
  } else {
    return simpleUrl(props.url)
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

function simpleUrl(url: string) {
  if (!url.startsWith('http')) {
    return url
  }

  const path = new URL(url)
  if (props.simple) {
    if (path.hash) {
      const [p] = path.hash.split('?')
      path.hash = p
      return String(path)
    } else {
      path.search = ''
      return String(path)
    }
  } else {
    return url
  }
}
</script>

<style scoped>
.block-domain {
  font-size: 12px;
  color: var(--el-color-info);
}
</style>
