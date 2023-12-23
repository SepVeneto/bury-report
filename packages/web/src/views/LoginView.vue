<template>
  <div class="login-container">
    <div style="width: 350px" class="login-wrap">
      <div class="login-title">{{store.title}}</div>
      <el-form :model="formData" label-width="60px">
        <el-form-item label="用户名">
          <el-input v-model="formData.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="formData.password" type="password" />
        </el-form-item>
        <el-form-item label="验证码">
          <div style="display:flex;">
            <el-input v-model="formData.verify_code" @keydown="handleLogin" />
            <el-image
              style="cursor: pointer; width: 100px; height: 32px; flex-shrink: 0;"
              title="点击刷新"
              :src="vertifyImg"
              @click.stop="getCodeImg"
            />
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" style="width: 100%;" @click="handleLogin()">登录</el-button>
        </el-form-item>
      </el-form>
    </div>
    <section ref="canvasRef" class="bg" />
  </div>
</template>

<script setup lang="ts">
import { ElInput, ElButton, ElForm, ElFormItem, ElImage } from 'element-plus'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLogoParticle } from '@/util/hooks'
import { useApp } from '@/store'
import RedirectView from '@/layout/RedirectView.vue'

const formData = ref({
  username: '',
  password: '',
  verify_code: '',
  verify_key: ''
})
const vertifyImg = ref('')
const canvasRef = ref<HTMLCanvasElement>()

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

async function getCodeImg() {
  /**
   * TODO: get captch
   */
  return ''
}

async function handleLogin(e?: KeyboardEvent | Event) {
  if (e instanceof KeyboardEvent && e.code !== 'Enter') {
    return;
  }
  localStorage.setItem('token', 'token')
  await router.isReady()
  router.replace({ name: 'RedirectView' })
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
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100vw;
  height: 100vh;
  background-image: linear-gradient(180deg, rgb(203, 235, 219) 0%, rgb(55, 148, 192) 120%);
}
</style>