<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import SHA256 from 'crypto-js/sha256'
import { useTurnstile } from '../composables/useTurnstile.js'
import { setToken } from '../utils/auth.js'
import { assertApiSuccess } from '../utils/apiResponse.js'
import request from '../utils/request.js'
import { useUserInfo } from '../composables/useUserInfo.js'

const { markLoggedIn } = useUserInfo()

const router     = useRouter()
const username   = ref('')
const password   = ref('')
const rememberMe = ref(false)
const loading    = ref(false)
const errorMsg   = ref('')
const cfToken    = ref('')
const showPassword = ref(false)

const canSubmit = computed(() => cfToken.value !== '' && !loading.value)

const turnstile = useTurnstile({
  containerSelector: '#turnstile-container',
  removeScriptOnUnmount: true,
  onSuccess(token) {
    cfToken.value = token
    errorMsg.value = ''
  },
  onError(code) {
    cfToken.value = ''
    errorMsg.value = code === 'script_load'
      ? '人机验证脚本加载失败，请检查网络'
      : `人机验证失败（${code}），请重试`
  },
  onExpired() {
    cfToken.value = ''
    errorMsg.value = '人机验证已过期，请重新验证'
  },
})

function resetTurnstile() {
  cfToken.value = ''
  turnstile.reset()
}

// ─── 登录 ──────────────────────────────────────────────────────────────────────

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  // canSubmit 计算属性已在 UI 层拦截，此处做防御性兜底
  if (!cfToken.value) {
    errorMsg.value = '请先完成人机验证'
    return
  }

  loading.value  = true
  errorMsg.value = ''

  try {
    const apiUrl   = import.meta.env.VITE_API_BASE_URL
    const response = await request(`${apiUrl}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value,
        password: SHA256(password.value).toString(), // SHA256 单向哈希
        cfToken:  cfToken.value,
      }),
    })

    const res = await response.json()
    assertApiSuccess(response, res, [20011], '登录失败')

    if (res.data?.accessToken) {
      setToken(res.data.accessToken, res.data.refreshToken, res.data.tokenType, rememberMe.value)
      markLoggedIn()           // 更新共享 ref，BlogList 挂载时直接拿到已登录状态
      await router.push('/')
    } else {
      errorMsg.value = res.msg || res.message || '登录失败，请重试'
      resetTurnstile()
      loading.value  = false
    }
  } catch (err) {
    // 登录失败后自动重置人机验证，无需手动刷新页面
    resetTurnstile()
    errorMsg.value = err.message || '登录异常'
    loading.value = false
  }
}

// ─── 生命周期 ──────────────────────────────────────────────────────────────────

onMounted(() => turnstile.inject())
onUnmounted(() => turnstile.cleanup())
</script>

<template>
  <div class="login-container">
    <Transition name="fade">
      <div v-if="loading" class="loading-overlay">
        <div class="spinner"></div>
      </div>
    </Transition>

    <div class="login-box">
      <h2>登录</h2>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>用户名</label>
          <input
            type="text"
            v-model="username"
            placeholder="请输入用户名"
            :disabled="loading"
            autocomplete="username"
            @keyup.enter="handleLogin"
          />
        </div>

        <div class="form-group">
          <label>密码</label>
          <div class="password-input-wrapper">
            <input
              :type="showPassword ? 'text' : 'password'"
              v-model="password"
              placeholder="请输入密码"
              :disabled="loading"
              autocomplete="current-password"
              @keyup.enter="handleLogin"
            />
          <span class="toggle-password" @click="showPassword = !showPassword" title="显示/隐藏密码">
            <!-- 闭眼图标 (隐藏密码) -->
            <svg v-if="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
            <!-- 睁眼图标 (显示密码) -->
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </span>
        </div>
      </div>

      <label class="remember-row">
        <input type="checkbox" v-model="rememberMe" :disabled="loading" />
        <span>记住我</span>
      </label>

      <!-- Turnstile 挂载点 -->
      <div class="turnstile-wrapper">
        <div id="turnstile-container"></div>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

        <button
          type="submit"
          class="btn login-btn"
          :disabled="!canSubmit"
        >
          {{ loading ? '登录中…' : '登录' }}
        </button>
        <button type="button" class="btn home-btn" @click="router.push('/')" :disabled="loading">
          返回主页
        </button>
        <button type="button" class="btn register-btn" @click="router.push('/register')" :disabled="loading">
          没有账号？去注册
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f5f5f5;
  position: relative;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e0e0e0;
  border-top-color: #111;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.login-box {
  background: #fff;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 380px;
}

.login-box h2 {
  margin: 0 0 24px 0;
  text-align: center;
  color: #111;
  font-weight: 600;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #555;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.2s;
}

.password-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input-wrapper input {
  padding-right: 40px; /* 为右侧图标留出空间 */
}

.toggle-password {
  position: absolute;
  right: 12px;
  cursor: pointer;
  color: #aaa;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.toggle-password:hover {
  color: #555;
}

.form-group input:focus {
  border-color: #111;
}

.form-group input:disabled {
  background: #f9f9f9;
  color: #aaa;
}

.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -4px 0 18px;
  color: #555;
  font-size: 14px;
  cursor: pointer;
}

.remember-row input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #111;
}

.remember-row input:disabled {
  cursor: not-allowed;
}

/* Turnstile 组件居中显示 */
.turnstile-wrapper {
  display: flex;
  justify-content: center;
  margin: 4px 0 18px;
  min-height: 65px; /* 预留高度，防止加载时页面跳动 */
}

.error-msg {
  color: #d32f2f;
  font-size: 13px;
  margin-bottom: 16px;
  text-align: center;
}

.login-btn {
  width: 100%;
  padding: 12px;
  background-color: #111;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 15px;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
}

.login-btn:hover:not(:disabled) {
  background-color: #333;
}

.login-btn:disabled {
  background-color: #999;
  cursor: not-allowed;
  opacity: 0.6;
}

.home-btn {
  width: 100%;
  margin-top: 10px;
  padding: 12px;
  background-color: transparent;
  color: #555;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.home-btn:hover:not(:disabled) {
  background-color: #f5f5f5;
  border-color: #aaa;
  color: #111;
}

.home-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.register-btn {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  background-color: transparent;
  color: #555;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.register-btn:hover:not(:disabled) {
  background-color: #f5f5f5;
  border-color: #aaa;
  color: #111;
}

.register-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
