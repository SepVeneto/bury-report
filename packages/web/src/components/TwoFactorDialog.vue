<template>
  <ElDialog
    v-model="visible"
    :title="mode === 'setup' ? '开启双因素验证' : '关闭双因素验证'"
    width="440px"
    destroy-on-close
    @closed="reset"
  >
    <template v-if="mode === 'setup'">
      <ElAlert
        title="使用身份验证器扫描二维码，再输入生成的6位动态码完成绑定。"
        type="info"
        :closable="false"
        show-icon
      />
      <div class="qr-code">
        <QrcodeVue
          v-if="otpauthUrl"
          :value="otpauthUrl"
          :size="220"
          level="M"
          render-as="svg"
        />
      </div>
      <p class="manual-tip">
        无法扫码时，可在身份验证器中手动输入以下密钥：
      </p>
      <ElForm label-width="90px">
        <ElFormItem label="密钥">
          <div class="secret-row">
            <ElInput
              :model-value="secret"
              readonly
            />
            <ElButton @click="copyContent(secret)">
              复制
            </ElButton>
          </div>
        </ElFormItem>
      </ElForm>
    </template>
    <ElForm label-width="90px">
      <ElFormItem label="动态码">
        <ElInput
          v-model="code"
          maxlength="6"
          placeholder="请输入身份验证器中的6位动态码"
          @keydown.enter="submit"
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="visible = false">
        取消
      </ElButton>
      <ElButton
        type="primary"
        :loading="submitting"
        @click="submit"
      >
        确认
      </ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
} from 'element-plus'
import QrcodeVue from 'qrcode.vue'
import { ref } from 'vue'
import { useApp } from '@/store'
import {
  disableTwoFactor,
  enableTwoFactor,
  getAccountProfile,
  setupTwoFactor,
} from '@/apis'
import { copyContent } from '@/util/tools'

defineOptions({
  name: 'TwoFactorDialog',
})

const emit = defineEmits(['updated'])
const store = useApp()
const visible = ref(false)
const mode = ref<'setup' | 'disable'>('setup')
const secret = ref('')
const otpauthUrl = ref('')
const code = ref('')
const submitting = ref(false)

async function open() {
  code.value = ''
  const profile = await getAccountProfile()
  store.setAccount(profile)
  if (profile.two_factor_enabled) {
    mode.value = 'disable'
    visible.value = true
    return
  }

  const result = await setupTwoFactor()
  mode.value = 'setup'
  secret.value = result.secret
  otpauthUrl.value = result.otpauth_url
  visible.value = true
}

async function submit() {
  if (!/^\d{6}$/.test(code.value)) return

  submitting.value = true
  try {
    if (mode.value === 'setup') {
      await enableTwoFactor(code.value)
    } else {
      await disableTwoFactor(code.value)
    }
    store.setAccount(await getAccountProfile())
    visible.value = false
    emit('updated')
  } finally {
    submitting.value = false
  }
}

function reset() {
  secret.value = ''
  otpauthUrl.value = ''
  code.value = ''
}

defineExpose({
  open,
})
</script>

<style scoped>
.secret-row {
  display: flex;
  width: 100%;
  gap: 8px;
}
.qr-code {
  display: flex;
  justify-content: center;
  margin: 22px 0 12px;
}
.manual-tip {
  margin: 0 0 12px;
  color: #697b8c;
  font-size: 13px;
  text-align: center;
}
</style>
