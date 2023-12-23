<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    />
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      pagination
      :api="getList"
    >
      <template #status="{row}">
        <rx-switch v-model="row.status" />
      </template>
      <template #operate="{row}">
        <bc-button type="primary" text @click="handleEdit(row)">编辑</bc-button>
        <bc-button type="primary" text @click="handleDetail(row)">详情</bc-button>
        <bc-button
          type="danger"
          text
          confirm
          @click="handleDelete(row)"
        >删除</bc-button>
      </template>
    </bc-table>
    <bc-dialog
      v-model="visible"
      title="对话框"
      width="550px"
      destroy-on-close
      @submit="handleSubmit"
    >
      <demo-dialog ref="dialogRef" />
    </bc-dialog>
  </section>
</template>

<script lang="ts">
import { defineComponent, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import demoDialog from './demo.dialog.vue'
import { Status } from '@/util/enum'
export default defineComponent({
  name: 'List',
  components: {
    demoDialog,
  },
  setup() {
    const router = useRouter()
    
    const params = ref({
      page: 1,
      size: 20,
    })
    const tableRef = ref()
    const tableConfig = shallowRef([
      { label: '名称', prop: 'name' },
      { label: '状态', prop: 'status' },
      { label: '操作', prop: 'operate' }
    ])
    const searchConfig = shallowRef([
      { catalog: 'input', prop: 'name', name: '名称' },
      { catalog: 'select', prop: 'status', name: '状态', options: ['是', '否'] },
    ])
    const visible = ref(false)
    const dialogRef = shallowRef()

    async function handleSubmit() {
      const postData = await dialogRef.value.getFormData()
      console.log(postData)
      visible.value = false;
    }
    function getList() {
      return Promise.resolve({
        data: {
          list: [{ name: 'name', status: Status.Enable }],
          total: 1,
        }
      })
    }
    function handleSearch() {
      console.log(params.value)
      tableRef.value.getList()
    }
    function handleDetail(row: Record<string, any>) {
      router.push({ name: 'NewsDetail' })
    }
    function handleEdit(row: Record<string, any>) {
      visible.value = true;
      console.log('编辑', row)
    }
    function handleDelete(row: Record<string, any>) {
      console.log('删除', row)
    }
    return {
      tableRef,
      dialogRef,

      searchConfig,
      tableConfig,
      visible,
      params,

      handleSearch,
      handleEdit,
      handleDelete,
      handleSubmit,
      handleDetail,
      getList,
    }
  }
})

</script>

