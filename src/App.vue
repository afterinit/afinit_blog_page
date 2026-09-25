<template>
  <router-view v-slot="{ Component }">
    <keep-alive include="BlogList,UserProfile">
      <component :is="Component" />
    </keep-alive>
  </router-view>

  <!-- 全局登录过期弹窗 -->
  <div v-if="showAuthExpiredModal" class="global-auth-modal">
    <div class="auth-modal-content">
      <h3>未登录或登录已过期</h3>
      <p>您的登录凭证已失效，请重新登录</p>
      <div class="auth-modal-btns">
        <button class="btn-cancel" @click="cancelAuthExpiredModal">取消</button>
        <button class="btn-confirm" @click="closeAuthExpiredModal">登录</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { showAuthExpiredModal, closeAuthExpiredModal, cancelAuthExpiredModal } from './composables/useAuthGuard.js'
import { useTheme } from './composables/useTheme.js'

useTheme()
</script>

<style scoped>
.global-auth-modal {
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483647;
}

.auth-modal-content {
  background: var(--bg-secondary); padding: 30px 40px;
  text-align: center; border: 1px solid var(--border-color);
  font-family: system-ui, -apple-system, sans-serif;
  min-width: 300px;
}

.auth-modal-content h3 {
  margin: 0 0 10px; font-size: 20px; color: var(--text-primary); font-weight: 600;
}

.auth-modal-content p {
  margin: 0 0 24px; font-size: 15px; color: var(--text-secondary);
}

.auth-modal-btns {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.auth-modal-btns button {
  padding: 10px 24px;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border-color);
}

.btn-cancel {
  background: transparent;
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn-confirm {
  background: var(--text-primary);
  color: var(--bg-primary);
  border-color: var(--text-primary);
}

.btn-confirm:hover {
  background: var(--accent-hover);
}
</style>
