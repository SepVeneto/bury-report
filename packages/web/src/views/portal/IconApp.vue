<template>
  <div style="display: flex; align-items: center; justify-content: center; flex-direction: column;">
    <div
      class="app-icon"
      @click.stop="handleDetail"
    >
      <span>{{ icon }}</span>
    </div>
    <div
      v-if="zoomIn"
      style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;"
    >
      {{ name }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
const props = defineProps({
  name: {
    type: String,
    required: true,
  },
  appId: {
    type: String,
    required: true,
  },
  zoomIn: Boolean,
})
const icon = computed(() => props.name.slice(0, 1))

function handleDetail() {
  window.open(`${window.origin}/#/manage/apps/${props.appId}`, '_blank')
}
</script>

<style lang=scss scoped>
.app-icon {
  cursor: pointer;
  margin: 0 auto;
  width: 60px;
  height: 60px;
  font-size: 24px;
  line-height: 1;
  border-radius: 10px;
  background: crimson;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
</style>
