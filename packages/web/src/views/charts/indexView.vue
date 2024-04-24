<template>
  <section style="display: flex;">
    <ElCard shadow="never">
      <template #header>
        <header style="display: flex;">
          <ElInput v-model="search" />
          <ElButton
            style="margin-left: 20px;"
            :icon="IconPlus"
            type="primary"
            @click="handleCreate"
          />
        </header>
      </template>
      <ElTree />
    </ElCard>

    <div style="flex: 1;" />

    <BcDialog
      v-model="visible"
      title="创建图表"
      no-footer
    >
      <EditChart />
    </BcDialog>
  </section>
</template>

<script lang="ts" setup>
import EditChart from './EditChart.vue'
import { Plus as IconPlus } from '@element-plus/icons-vue'
import { ref } from 'vue'

const search = ref('')
const visible = ref(false)
function handleCreate() {
  visible.value = true
}
</script>
