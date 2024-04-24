<template>
  <section>
    <ElSteps :active="active">
      <ElStep title="类型选择" />
      <ElStep title="数据源" />
      <ElStep title="参数配置" />
      <ElStep title="预览" />
    </ElSteps>

    <div
      v-if="active === 0"
      style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; padding: 10px;"
    >
      <ChartIcon
        v-for="(item, index) in type"
        :key="index"
        v-bind="item"
        :active="item.type === formData.type"
        @click="formData.type = item.type"
      />
    </div>

    <ElForm
      v-else-if="active === 1"
      :model="formData"
    >
      <div>TODO: 数据源</div>
    </ElForm>

    <!-- <ElForm
      v-else-if="active === 2"
      :model="formData"
    ></ElForm> -->

    <footer style="text-align: right;">
      <ElButton>取消</ElButton>
      <ElButton
        v-if="showPrevious"
        @click="previous()"
      >
        上一步
      </ElButton>
      <ElButton
        v-if="showNext"
        :disabled="!formData.type"
        @click="next()"
      >
        下一步
      </ElButton>
      <ElButton
        v-if="isEnd"
        @click="handleSubmit"
      >
        确认
      </ElButton>
    </footer>
  </section>
</template>

<script lang="ts" setup>
import ChartIcon from './components/ChartIcon.vue'
import { ref } from 'vue'
import { useSteps } from './hooks'

const { active, showNext, showPrevious, isEnd, next, previous } = useSteps(2)
const type = [
  { label: '饼图', type: 'pie' },
  { label: '折线图', type: 'line' },
  { label: '柱状图', type: 'bar' },
] as const
const formData = ref({})

function handleSubmit() {

}
</script>
