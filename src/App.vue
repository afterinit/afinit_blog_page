<template>
  <router-view v-slot="{ Component }">
    <keep-alive include="BlogList">
      <component :is="Component" />
    </keep-alive>
  </router-view>

  <!-- 全局登录过期弹窗 -->
  <div v-if="showAuthExpiredModal" class="global-auth-modal">
    <div class="auth-modal-content">
      <h3>⚠️ 登录已过期</h3>
      <p>您的登录凭证已失效，请重新登录</p>
      <div class="auth-modal-btns">
        <button class="btn-cancel" @click="cancelAuthExpiredModal">取消</button>
        <button class="btn-confirm" @click="closeAuthExpiredModal">重新登录</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { showAuthExpiredModal, closeAuthExpiredModal, cancelAuthExpiredModal } from './composables/useAuthGuard.js'
</script>

<style scoped>
.global-auth-modal {
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483647;
}

.auth-modal-content {
  background: #fff; padding: 30px 40px; border-radius: 12px;
  text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  font-family: system-ui, -apple-system, sans-serif;
  min-width: 300px;
}

.auth-modal-content h3 {
  margin: 0 0 10px; font-size: 20px; color: #111; font-weight: 600;
}

.auth-modal-content p {
  margin: 0 0 24px; font-size: 15px; color: #666;
}

.auth-modal-btns {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.auth-modal-btns button {
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background: #f0f0f0;
  color: #333;
}

.btn-cancel:hover {
  background: #e0e0e0;
}

.btn-confirm {
  background: #111;
  color: #fff;
}

.btn-confirm:hover {
  background: #333;
}
</style>
