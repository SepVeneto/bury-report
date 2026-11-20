<template>
  <div class="login-container">
    <section
      ref="canvasRef"
      class="bg"
    />
    <div class="login-wrap">
      <div class="login-title">
        {{ store.title }}
      </div>
      <ElForm
        :model="formData"
        label-width="80px"
      >
        <template v-if="!reset.token && !setup.token">
          <ElFormItem label="用户名">
            <ElInput v-model="formData.name" />
          </ElFormItem>
          <ElFormItem label="密码">
            <ElInput
              v-model="formData.password"
              type="password"
              @keydown.enter="submitLogin()"
            />
          </ElFormItem>
          <ElFormItem
            v-if="twoFactor.challenge"
            label="动态码"
          >
            <ElInput
              v-model="twoFactor.code"
              maxlength="6"
              placeholder="请输入身份验证器中的6位验证码"
              @keydown.enter="handleTwoFactorLogin()"
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton
              type="primary"
              style="width: 100%;"
              :loading="loginState === 'loading'"
              @click="submitLogin()"
            >
              {{ twoFactor.challenge ? '验证并登录' : '登录' }}
            </ElButton>
          </ElFormItem>
          <ElButton
            v-if="twoFactor.challenge"
            text
            style="width: 100%;"
            @click="cancelTwoFactor"
          >
            返回账号密码登录
          </ElButton>
        </template>

        <template v-else-if="reset.token">
          <ElAlert
            title="首次登录需要先重置临时密码"
            type="warning"
            :closable="false"
            show-icon
          />
          <ElFormItem label="新密码">
            <ElInput
              v-model="reset.password"
              type="password"
              show-password
            />
          </ElFormItem>
          <ElFormItem label="确认密码">
            <ElInput
              v-model="reset.confirm"
              type="password"
              show-password
              @keydown.enter="handleResetPassword"
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton
              type="primary"
              style="width: 100%;"
              :loading="loginState === 'loading'"
              @click="handleResetPassword"
            >
              重置密码
            </ElButton>
          </ElFormItem>
        </template>

        <template v-else>
          <ElAlert
            title="首次登录需要绑定身份验证器"
            type="warning"
            :closable="false"
            show-icon
          />
          <div class="setup-qr">
            <QrcodeVue
              v-if="setup.otpauthUrl"
              :value="setup.otpauthUrl"
              :size="200"
              level="M"
              render-as="svg"
            />
          </div>
          <div class="setup-secret">
            无法扫码时手动输入：{{ setup.secret }}
          </div>
          <ElFormItem label="动态码">
            <ElInput
              v-model="setup.code"
              maxlength="6"
              placeholder="请输入身份验证器中的6位验证码"
              @keydown.enter="handleBindTwoFactor"
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton
              type="primary"
              style="width: 100%;"
              :loading="loginState === 'loading'"
              @click="handleBindTwoFactor"
            >
              绑定并登录
            </ElButton>
          </ElFormItem>
        </template>
      </ElForm>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
} from 'element-plus'
import QrcodeVue from 'qrcode.vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLogoParticle } from '@/util/hooks'
import { useApp } from '@/store'
import RedirectView from '@/layout/RedirectView.vue'
import {
  enableInitialTwoFactor,
  login,
  loginTwoFactor,
  resetInitialPassword,
  setupInitialTwoFactor,
} from '@/apis'
import type { LoginResult } from '@/apis'

const formData = ref({
  name: '',
  password: '',
})
const canvasRef = ref<HTMLCanvasElement>()
const loginState = ref<'wait' | 'loading'>('wait')
const twoFactor = ref({
  challenge: '',
  code: '',
})
const reset = ref({
  token: '',
  password: '',
  confirm: '',
})
const setup = ref({
  token: '',
  secret: '',
  otpauthUrl: '',
  code: '',
})

const router = useRouter()
const store = useApp()
if (!router.hasRoute('RedirectView')) {
  router.addRoute({
    path: '/:pathMatch(.*)*',
    name: 'RedirectView',
    component: RedirectView,
  })
}
useLogoParticle(canvasRef)

async function submitLogin() {
  if (twoFactor.value.challenge) {
    await handleTwoFactorLogin()
    return
  }
  await handlePasswordLogin()
}
async function handlePasswordLogin() {
  if (!formData.value.name || !formData.value.password) return

  loginState.value = 'loading'
  try {
    const result = await login(formData.value)
    if (result.requiresPasswordReset) {
      reset.value = {
        token: result.resetToken,
        password: '',
        confirm: '',
      }
      loginState.value = 'wait'
      return
    }
    if (result.requires2FASetup) {
      await beginTwoFactorSetup(result.setupToken)
      return
    }
    if (result.requires2FA) {
      twoFactor.value = {
        challenge: result.challenge,
        code: '',
      }
      loginState.value = 'wait'
      return
    }
    await completeLogin(result)
  } catch {
    loginState.value = 'wait'
  }
}
async function handleResetPassword() {
  if (reset.value.password.length < 6 || reset.value.password.length > 16) {
    ElMessage.error('密码长度应为6-16位')
    return
  }
  if (reset.value.password !== reset.value.confirm) {
    ElMessage.error('两次输入的密码不一致')
    return
  }

  loginState.value = 'loading'
  try {
    const result = await resetInitialPassword({
      resetToken: reset.value.token,
      password: reset.value.password,
    })
    if ('requires2FASetup' in result) {
      reset.value.token = ''
      await beginTwoFactorSetup(result.setupToken)
      return
    }
    await completeLogin(result)
  } catch {
    loginState.value = 'wait'
  }
}
async function beginTwoFactorSetup(setupToken: string) {
  loginState.value = 'loading'
  try {
    setup.value.token = setupToken
    const result = await setupInitialTwoFactor(setupToken)
    setup.value.secret = result.secret
    setup.value.otpauthUrl = result.otpauth_url
    setup.value.code = ''
    loginState.value = 'wait'
  } catch {
    setup.value.token = ''
    loginState.value = 'wait'
  }
}
async function handleBindTwoFactor() {
  if (!/^\d{6}$/.test(setup.value.code)) return

  loginState.value = 'loading'
  try {
    const result = await enableInitialTwoFactor({
      setupToken: setup.value.token,
      code: setup.value.code,
    })
    await completeLogin(result)
  } catch {
    setup.value.code = ''
    loginState.value = 'wait'
  }
}
async function handleTwoFactorLogin() {
  if (!/^\d{6}$/.test(twoFactor.value.code)) {
    return
  }
  loginState.value = 'loading'
  try {
    const result = await loginTwoFactor({
      challenge: twoFactor.value.challenge,
      code: twoFactor.value.code,
    })
    await completeLogin(result)
  } catch {
    twoFactor.value.code = ''
    loginState.value = 'wait'
  }
}
async function completeLogin(result: Extract<LoginResult, { token: string }>) {
  localStorage.setItem('token', result.token)
  store.setAccount(result.account)
  await router.isReady()
  router.replace({ name: 'Portal' })
}
function cancelTwoFactor() {
  twoFactor.value = {
    challenge: '',
    code: '',
  }
  loginState.value = 'wait'
}
</script>

<style lang="scss" scoped>
.bg {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.login-wrap {
  width: 400px;
  margin-top: 300px;
  float: right;
  .login-title {
    font-size: 24px;
    text-align: center;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  background: #fff;
  padding: 20px;
  border-radius: 6px;
}
.setup-qr {
  display: flex;
  justify-content: center;
  margin: 18px 0 8px;
}
.setup-secret {
  margin-bottom: 18px;
  color: #697b8c;
  font-size: 13px;
  text-align: center;
  word-break: break-all;
}
.login-container {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  position: relative;
  overflow: hidden;
  width: 100vw;
  height: 100vh;
  background-image: linear-gradient(180deg, rgb(203, 235, 219) 0%, rgb(55, 148, 192) 120%);
}
</style>
