<template>
  <view class="content">
    <image
      class="logo"
      src="/static/logo.png"
    />
    <button @click="c">
      click me
    </button>
    <view class="text-area">
      <text class="title">
        {{ title }}
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
function c() {
  window.alert('c')
}
const title = ref('Hello')
uni.request({
  url: '/api/captcha',
  method: 'GET',
  success: () => {
    console.log('success', title.value)
  },
  fail: (res) => {
    console.log('fail', title.value, res.errMsg)
  },
})
</script>

<style>
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 200rpx;
  width: 200rpx;
  margin-top: 200rpx;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 50rpx;
}

.text-area {
  display: flex;
  justify-content: center;
}

.title {
  font-size: 36rpx;
  color: #8f8f94;
}
</style>
