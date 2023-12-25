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
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton
            ref="loginRef"
            type="primary"
            style="width: 100%;"
            :disabled="loginState === 'captcha'"
            :loading="loginState === 'loading'"
            @click="handleLogin()"
          >
            登录
          </ElButton>
        </ElFormItem>
      </ElForm>
      <ElPopover
        ref="popoverRef"
        :virtual-ref="loginRef"
        trigger="click"
        virtual-triggering
        width="334"
        @show="loginState = 'captcha'"
      >
        <JigsawCaptcha
          ref="captchaRef"
          :background="captcha.background"
          :block="captcha.block"
          @finish="onFinish"
        />
      </ElPopover>
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
import { getCaptcha, login } from '@/apis'
// import { Jigsaw } from '@jigsaw/captcha'
import JigsawCaptcha from '@/components/captcha.vue'

const formData = ref({
  name: '',
  password: '',
})
const canvasRef = ref<HTMLCanvasElement>()
const captcha = ref({
  background: '',
  block: '',
  key: '',
})
const loginRef = ref()
const popoverRef = ref()
const captchaRef = ref()
const loginState = ref<'wait' | 'loading' | 'captcha'>('wait')

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

async function onFinish(res: number) {
  loginState.value = 'loading'
  try {
    const result = await login({
      ...formData.value,
      key: captcha.value.key,
      offset: res,
    })

    localStorage.setItem('token', result.token)
    await router.isReady()
    router.replace({ name: 'RedirectView' })
  } catch {
    popoverRef.value.hide()
    loginState.value = 'wait'
    captchaRef.value.reset()
  }
}
async function handleLogin(e?: KeyboardEvent | Event) {
  if (e instanceof KeyboardEvent && e.code !== 'Enter') {
    return
  }
  const _captcha = await getCaptcha()
  captcha.value = _captcha
  // const jigsaw = new Jigsaw({
  //   width: 310,
  //   height: 155,
  //   background: captcha.background,
  //   block: captcha.block,
  //   onFinish(offset) {
  //     console.log(offset)
  //   },
  // })
  // jigsaw.render('#captcha')
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
