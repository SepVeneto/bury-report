<template>
  <div class="login-container">
    <section
      ref="canvasRef"
      class="bg"
    />
    <div
      style="width: 350px"
      class="login-wrap"
    >
      <div class="login-title">
        {{ store.title }}
      </div>
      <ElForm
        :model="formData"
        label-width="60px"
      >
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
      </ElForm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElButton, ElForm, ElFormItem, ElInput } from 'element-plus'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLogoParticle } from '@/util/hooks'
import { useApp } from '@/store'
import RedirectView from '@/layout/RedirectView.vue'
import { login, loginTwoFactor } from '@/apis'
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
