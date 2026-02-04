<template>
  <ElForm
    :model="model"
    label-width="120px"
  >
    <ElFormItem
      label="规则名称"
      prop="name"
    >
      <BcInput v-model="model.name" />
    </ElFormItem>

    <ElFormItem
      label="告警策略"
      prop="strategy"
    >
      <ElRadioGroup v-model="model.notify.strategy">
        <ElRadio
          label="仅一次"
          value="once"
        />
        <ElRadio
          label="窗口期触发"
          value="window"
        />
        <ElRadio
          label="阈值触发"
          value="limit"
        />
      </ElRadioGroup>
    </ElFormItem>

    <ElFormItem
      v-if="model.notify.strategy !== 'once'"
      label="告警窗口（秒）"
    >
      <ElInputNumber
        v-model="model.notify.window_sec"
        :min="60 * 1"
        :step="1"
        :max="60 * 60 * 24"
      />
    </ElFormItem>

    <ElFormItem
      v-if="model.notify.strategy === 'limit'"
      label="告警阈值"
    >
      <ElInputNumber
        v-model="model.notify.limit"
        :min="10"
        :step="1"
      />
    </ElFormItem>

    <ElFormItem label="触发源">
      <ElRadioGroup
        v-model="model.source.type"
        @change="onChange"
      >
        <ElRadio
          label="日志集合"
          value="collection"
        />
        <ElRadio
          label="指纹"
          value="fingerprint"
        />"
        <ElRadio
          label="分组"
          value="group"
        />
      </ElRadioGroup>
    </ElFormItem>

    <ElFormItem
      v-if="model.source.type === 'collection'"
      label="告警类型"
      prop="log_type"
    >
      <ElRadioGroup v-model="model.source.log_type">
        <ElRadio
          label="错误日志"
          value="error"
        />
        <ElRadio
          label="接口日志"
          value="api"
        />
        <ElRadio
          label="自定义日志"
          value="log"
        />
      </ElRadioGroup>
    </ElFormItem>

    <ElFormItem
      v-else-if="model.source.type === 'fingerprint'"
      label="指纹"
      prop="fingerprint"
    >
      <BcInput v-model="model.source.fingerprint" />
    </ElFormItem>

    <ElFormItem
      v-else-if="model.source.type === 'group'"
      label="匹配结构"
    >
      <div
        v-for="(cond, index) in model.source.condition"
        :key="index"
        style="display: flex;"
      >
        <BcSelect
          v-model="cond.type"
          :options="[
            { label: '文本', value: 'literal' },
            { label: '数字', value: 'number' },
            { label: 'UUID', value: 'uuid' },
          ]"
          :clearable="false"
        />
        <BcInput
          v-model="cond.value"
          :disabled="cond.type !== 'literal'"
        />
        <BcButton
          text
          type="danger"
          :icon="IconDelete"
          @click="onDelete(index)"
        />
      </div>
      <BcButton
        :icon="IconPlus"
        @click="model.source.condition?.push({ type: 'literal' })"
      />
    </ElFormItem>

    <ElFormItem label="通知地址">
      <BcInput v-model="model.notify.url" />
    </ElFormItem>

    <ElFormItem
      label="状态"
    >
      <RxSwitch v-model="model.enabled" />
    </ElFormItem>
  </ElForm>
</template>

<script lang="ts" setup>
import type { AlertRule } from '@/apis'
import RxSwitch from '@/components/switch/rxSwitch.vue'
import {
  Delete as IconDelete,
  Plus as IconPlus,
} from '@element-plus/icons-vue'

const model = defineModel<AlertRule>({ required: true })

function onChange() {
  if (model.value.source.type === 'group' && !Array.isArray(model.value.source.condition)) {
    model.value.source.condition = []
  }
}

function onDelete(index: number) {
  model.value.source.condition?.splice(index, 1)
}
</script>
