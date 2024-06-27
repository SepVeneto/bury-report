<template>
  <div style="padding: 20px;">
    <ElTabs type="border-card">
      <ElTabPane label="常规">
        <ElSkeleton
          :loading="loading"
          animated
          class="skeleton-normal"
        >
          <template #default>
            <ElDescriptions :column="1">
              <ElDescriptionsItem label="请求URL">
                {{ detail.data.url }}
              </ElDescriptionsItem>
              <ElDescriptionsItem label="请求方法">
                {{ detail.data.method }}
              </ElDescriptionsItem>
              <ElDescriptionsItem label="状态代码">
                <StatusIcon :code="detail.data.status" />
              </ElDescriptionsItem>
              <ElDescriptionsItem label="发起地址">
                {{ detail.data.page }}
              </ElDescriptionsItem>
            </ElDescriptions>
          </template>
        </ElSkeleton>
      </ElTabPane>
      <ElTabPane label="请求参数">
        <ElSkeleton
          :loading="loading"
          animated
          class="skeleton-request"
        >
          <template #default>
            <JsonViewer :value="JSON.parse(detail.data.body)" />
          </template>
        </ElSkeleton>
      </ElTabPane>
      <ElTabPane label="响应标头">
        <ElSkeleton
          :loading="loading"
          animated
          class="skeleton-header"
        >
          <template #default>
            <pre>{{ detail.data.responseHeaders }}</pre>
          </template>
        </ElSkeleton>
      </ElTabPane>
      <ElTabPane label="响应">
        <ElSkeleton
          :loading="loading"
          animated
          class="skeleton-response"
        >
          <template #default>
            <JsonViewer :value="JSON.parse(detail.data.response)" />
          </template>
        </ElSkeleton>
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<script lang="ts" setup>
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { JsonViewer } from 'vue3-json-viewer'
import 'vue3-json-viewer/dist/index.css'
import { ref } from 'vue'
import { getAppNetworkDetail } from '@/apis'
import StatusIcon from '@/components/statusIcon.vue'

const props = defineProps({
  networkId: {
    type: String,
    required: true,
  },
})

const detail = ref()

const loading = ref(true)

getAppNetworkDetail(props.networkId).then(res => {
  detail.value = res
}).finally(() => {
  loading.value = false
})
</script>

<style scoped>
.skeleton-normal :deep(.el-skeleton__text) {
  height: 25px;
  margin-top: 1px;
  margin-bottom: 12px;
}
</style>
