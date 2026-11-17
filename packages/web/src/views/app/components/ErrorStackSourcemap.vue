<template>
  <section
    v-if="restored.frames.length"
    class="sourcemap-result"
  >
    <header class="sourcemap-result__header">
      <span>源码还原</span>
      <small>{{ restored.matched }} / {{ restored.frames.length }} 个栈帧已匹配</small>
    </header>
    <article
      v-for="(frame, index) in restored.frames"
      :key="`${frame.raw}-${index}`"
      class="sourcemap-frame"
    >
      <div
        v-if="frame.original"
        class="sourcemap-frame__location"
      >
        <code>{{ frame.original.source }}:{{ frame.original.line }}:{{ frame.original.column }}</code>
        <span v-if="frame.functionName">{{ frame.functionName }}</span>
      </div>
      <div
        v-else
        class="sourcemap-frame__location sourcemap-frame__location--missing"
      >
        <code>{{ frame.raw }}</code>
      </div>
      <small class="sourcemap-frame__meta">
        {{ frame.mapName || '无匹配文件' }} ·
        {{ frame.generated.file }}:{{ frame.generated.line }}:{{ frame.generated.column }}
      </small>
      <pre
        v-if="frame.code.length"
        class="sourcemap-frame__code"
      ><span
        v-for="line in frame.code"
        :key="line.line"
        :class="{ current: line.current }"
      >{{ String(line.line).padStart(4, ' ') }} | {{ line.text }}</span></pre>
      <p
        v-else-if="frame.reason"
        class="sourcemap-frame__reason"
      >
        {{ frame.reason }}
      </p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LoadedSourceMap } from '@/util/sourcemap'
import { restoreStack } from '@/util/sourcemap'

const props = defineProps<{
  stack?: string
  sourceMaps: LoadedSourceMap[]
}>()

const restored = computed(() => restoreStack(props.stack || '', props.sourceMaps))
</script>

<style lang="scss" scoped>
.sourcemap-result {
  margin: 16px 0 16px 100px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}

.sourcemap-result__header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
  font-weight: 600;
}

.sourcemap-result__header small,
.sourcemap-frame__meta,
.sourcemap-frame__reason {
  color: var(--el-text-color-secondary);
  font-weight: normal;
}

.sourcemap-frame + .sourcemap-frame {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--el-border-color);
}

.sourcemap-frame__location {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--el-color-danger);
}

.sourcemap-frame__location--missing {
  color: var(--el-text-color-secondary);
}

.sourcemap-frame__meta {
  display: block;
  margin-top: 4px;
}

.sourcemap-frame__code {
  margin: 8px 0 0;
  padding: 10px 12px;
  overflow-x: auto;
  border-radius: 4px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.6;
}

.sourcemap-frame__code span {
  display: block;
  white-space: pre;
}

.sourcemap-frame__code .current {
  margin: 0 -12px;
  padding: 0 12px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.sourcemap-frame__reason {
  margin: 8px 0 0;
  font-size: 12px;
}
</style>
