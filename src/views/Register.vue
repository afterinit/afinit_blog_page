<script setup>
import { reactive, ref, computed, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import SHA256 from 'crypto-js/sha256'
import { useTurnstile } from '../composables/useTurnstile.js'
import request from '../utils/request.js'
import { assertApiSuccess } from '../utils/apiResponse.js'

// ─── 状态 ──────────────────────────────────────────────────────────────────

const router = useRouter()

/** 注册表单字段 */
const form = reactive({
  email:           '',
  code:            '',
  username:        '',
  password:        '',
  confirmPassword: '',
})

/** 提交加载态 */
const isSubmitting = ref(false)

/** 发送验证码加载态（Turnstile 验证通过后请求期间） */
const isSending = ref(false)

/** 错误信息 */
const errorMsg = ref('')

/** 成功提示 */
const successMsg = ref('')

/** 倒计时秒数，0 表示可点击 */
const countdown = ref(0)
let countdownTimer = null

// ─── Turnstile Modal 状态 ───────────────────────────────────────────────────

const showTurnstileModal = ref(false)

const turnstile = useTurnstile({
  containerSelector: '#turnstile-register-container',
  onSuccess: (token) => sendVerificationCode(token),
  onError(code) {
    showError(code === 'script_load'
      ? '人机验证脚本加载失败，请检查网络连接'
      : `人机验证失败（${code}），请重试`)
  },
  onExpired() {
    showError('人机验证已过期，请重新验证')
    turnstile.reset()
  },
})

// ─── 计算属性 ────────────────────────────────────────────────────────────────

/** "获取验证码"按钮状态 */
const canGetCode = computed(() => countdown.value === 0 && !isSending.value)

/** 按钮文字 */
const codeBtnText = computed(() => {
  if (isSending.value) return '发送中…'
  if (countdown.value > 0) return `${countdown.value}s 后重发`
  return '获取验证码'
})

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function startCountdown() {
  countdown.value = 60
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdown.value = 0
    }
  }, 1000)
}

function showError(msg) {
  errorMsg.value = msg
  successMsg.value = ''
}

function showSuccess(msg) {
  successMsg.value = msg
  errorMsg.value = ''
  setTimeout(() => { successMsg.value = '' }, 5000)
}

function closeTurnstileModal() {
  showTurnstileModal.value = false
  turnstile.removeWidget()
}

// ─── 获取验证码入口 ──────────────────────────────────────────────────────────

async function handleGetCode() {
  if (!canGetCode.value) return

  errorMsg.value = ''

  if (!form.email) {
    showError('请输入邮箱地址')
    return
  }
  if (!isValidEmail(form.email)) {
    showError('邮箱格式不正确')
    return
  }
  if (!turnstile.siteKeyConfigured) {
    showError('系统配置错误：人机验证不可用，请联系管理员')
    return
  }

  showTurnstileModal.value = true
  await nextTick()
  turnstile.inject()
}

// ─── 发送验证码 ──────────────────────────────────────────────────────────────

async function sendVerificationCode(cfToken) {
  isSending.value = true
  try {
    const apiUrl   = import.meta.env.VITE_API_BASE_URL
    const response = await request(`${apiUrl}/user/code`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cfToken, to: form.email }),
    })
    const res = await response.json()
    assertApiSuccess(response, res, [20502], '验证码发送失败')

    closeTurnstileModal()
    startCountdown()
    showSuccess('验证码已发送，请查收邮件（注意检查垃圾箱）')
  } catch (err) {
    // 发送失败：关闭弹层，把错误信息展示在表单区
    closeTurnstileModal()
    showError(err.message || '验证码发送失败，请稍后重试')
  } finally {
    isSending.value = false
  }
}

// ─── 注册提交 ────────────────────────────────────────────────────────────────

async function handleRegister() {
  errorMsg.value = ''

  // ── 前端校验 ────────────────────────────────────────────────────────────────
  if (!form.email || !form.code || !form.username || !form.password || !form.confirmPassword) {
    showError('请填写所有必填项')
    return
  }
  if (!isValidEmail(form.email)) {
    showError('邮箱格式不正确')
    return
  }
  if (form.username.length > 50) {
    showError('用户名长度不能超过 50 个字符')
    return
  }
  if (form.password.length < 6 || form.password.length > 30) {
    showError('密码长度必须在 6 - 30 个字符之间')
    return
  }
  if (form.password !== form.confirmPassword) {
    showError('两次输入的密码不一致')
    return
  }
  if (form.code.length !== 6) {
    showError('验证码必须为 6 位数字')
    return
  }

  // ── 请求 ────────────────────────────────────────────────────────────────────
  isSubmitting.value = true
  try {
    const apiUrl   = import.meta.env.VITE_API_BASE_URL
    const response = await request(`${apiUrl}/user/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username: form.username,
        password: SHA256(form.password).toString(), // SHA256 单向哈希
        email:    form.email,
        code:     form.code,
      }),
    })
    const res = await response.json()
    assertApiSuccess(response, res, [20051], '注册失败')

    // ── 注册成功：提示后跳转登录页 ────────────────────────────────────────────
    showSuccess('注册成功！即将跳转到登录页…')
    setTimeout(() => router.push('/login'), 1500)
  } catch (err) {
    showError(err.message || '注册失败，请稍后重试')
  } finally {
    isSubmitting.value = false
  }
}


onUnmounted(() => {
  clearInterval(countdownTimer)
  turnstile.removeWidget()
})
</script>

<template>
  <div class="register-container">
    <!-- 加载遮罩 -->
    <Transition name="fade">
      <div v-if="isSubmitting" class="loading-overlay">
        <div class="spinner"></div>
      </div>
    </Transition>

    <div class="register-box">
      <h2>注册</h2>

      <!-- 邮箱 + 获取验证码 -->
      <div class="form-group">
        <label for="reg-email">邮箱</label>
        <div class="email-row">
          <input
            id="reg-email"
            v-model.trim="form.email"
            type="email"
            placeholder="请输入邮箱地址"
            autocomplete="email"
            :disabled="isSubmitting"
          />
          <button
            type="button"
            class="btn code-btn"
            :disabled="!canGetCode"
            @click="handleGetCode"
          >
            {{ codeBtnText }}
          </button>
        </div>
      </div>

      <!-- 验证码 -->
      <div class="form-group">
        <label for="reg-code">验证码</label>
        <input
          id="reg-code"
          v-model.trim="form.code"
          type="text"
          placeholder="请输入邮箱验证码"
          maxlength="8"
          :disabled="isSubmitting"
        />
      </div>

      <!-- 用户名 -->
      <div class="form-group">
        <label for="reg-username">用户名</label>
        <input
          id="reg-username"
          v-model.trim="form.username"
          type="text"
          placeholder="请输入用户名"
          autocomplete="username"
          :disabled="isSubmitting"
        />
      </div>

      <!-- 密码 -->
      <div class="form-group">
        <label for="reg-password">密码</label>
        <input
          id="reg-password"
          v-model="form.password"
          type="password"
          placeholder="请输入密码（至少 6 位）"
          autocomplete="new-password"
          :disabled="isSubmitting"
        />
      </div>

      <!-- 确认密码 -->
      <div class="form-group">
        <label for="reg-confirm-password">确认密码</label>
        <input
          id="reg-confirm-password"
          v-model="form.confirmPassword"
          type="password"
          placeholder="请再次输入密码"
          autocomplete="new-password"
          :disabled="isSubmitting"
          @keyup.enter="handleRegister"
        />
      </div>

      <!-- 错误 / 成功提示 -->
      <p v-if="errorMsg" class="feedback-msg error-msg" role="alert">{{ errorMsg }}</p>
      <p v-if="successMsg" class="feedback-msg success-msg" role="status">{{ successMsg }}</p>

      <!-- 注册按钮 -->
      <button
        class="btn register-btn"
        :disabled="isSubmitting"
        @click="handleRegister"
      >
        {{ isSubmitting ? '注册中…' : '注册' }}
      </button>

      <!-- 跳转登录 -->
      <button class="btn secondary-btn" @click="router.push('/login')" :disabled="isSubmitting">
        已有账号，去登录
      </button>
    </div>

    <!-- ── Turnstile 验证 Modal ───────────────────────────────────────────── -->
    <Transition name="modal-fade">
      <div v-if="showTurnstileModal" class="modal-backdrop" @mousedown.self="closeTurnstileModal">
        <div class="modal-card">
          <div class="modal-header">
            <span>请完成人机验证</span>
            <button class="modal-close" aria-label="关闭" @click="closeTurnstileModal">✕</button>
          </div>

          <div class="modal-body">
            <!-- 脚本加载中的骨架占位 -->
            <div v-if="turnstile.scriptLoading.value" class="turnstile-skeleton">
              <div class="skeleton-shimmer"></div>
            </div>
            <!-- Turnstile 挂载点 -->
            <div id="turnstile-register-container"></div>
          </div>

          <p class="modal-hint">验证通过后将自动发送验证码</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ── 布局 ──────────────────────────────────────────────────────────────────── */
.register-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f5f5;
  position: relative;
}

/* ── 加载遮罩 ───────────────────────────────────────────────────────────────── */
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
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

/* ── 卡片 ──────────────────────────────────────────────────────────────────── */
.register-box {
  background: #fff;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
}

.register-box h2 {
  margin: 0 0 24px;
  text-align: center;
  color: #111;
  font-weight: 600;
}

/* ── 表单 ──────────────────────────────────────────────────────────────────── */
.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  margin-bottom: 7px;
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

.form-group input:focus {
  border-color: #111;
}

.form-group input:disabled {
  background: #f9f9f9;
  color: #aaa;
}

/* ── 邮箱行（输入框 + 按钮并排） ───────────────────────────────────────────── */
.email-row {
  display: flex;
  gap: 8px;
}

.email-row input {
  flex: 1;
  min-width: 0; /* 防止溢出 */
}

/* ── 反馈信息 ───────────────────────────────────────────────────────────────── */
.feedback-msg {
  margin: 0 0 16px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}

.error-msg {
  background: #fff5f5;
  color: #d32f2f;
  border: 1px solid #fecaca;
}

.success-msg {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

/* ── 按钮基础 ───────────────────────────────────────────────────────────────── */
.btn {
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s, border-color 0.2s;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 获取验证码按钮 */
.code-btn {
  flex-shrink: 0;
  padding: 10px 14px;
  background-color: #111;
  color: #fff;
  white-space: nowrap;
  font-size: 13px;
}

.code-btn:hover:not(:disabled) {
  background-color: #333;
}

.code-btn:disabled {
  background-color: #999;
}

/* 注册主按钮 */
.register-btn {
  width: 100%;
  padding: 12px;
  background-color: #111;
  color: #fff;
  font-size: 15px;
  margin-bottom: 10px;
}

.register-btn:hover:not(:disabled) {
  background-color: #333;
}

.register-btn:disabled {
  background-color: #999;
}

/* 次要按钮（去登录） */
.secondary-btn {
  width: 100%;
  padding: 12px;
  background-color: transparent;
  color: #555;
  border: 1px solid #ddd;
  font-size: 14px;
}

.secondary-btn:hover:not(:disabled) {
  background-color: #f5f5f5;
  border-color: #aaa;
  color: #111;
}

/* ── Turnstile Modal ────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-card {
  background: #fff;
  border-radius: 10px;
  padding: 24px;
  width: 340px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  font-size: 15px;
  font-weight: 600;
  color: #111;
}

.modal-close {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: #888;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}

.modal-close:hover {
  background: #f0f0f0;
  color: #111;
}

.modal-body {
  display: flex;
  justify-content: center;
  min-height: 65px;
}

/* 骨架屏（脚本加载中占位） */
.turnstile-skeleton {
  width: 300px;
  height: 65px;
  border-radius: 6px;
  overflow: hidden;
  background: #e8e8e8;
  position: relative;
}

.skeleton-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%);
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.modal-hint {
  margin: 16px 0 0;
  text-align: center;
  font-size: 12px;
  color: #999;
}

/* Modal 过渡动画 */
.modal-fade-enter-active {
  transition: opacity 0.2s, transform 0.2s;
}
.modal-fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
.modal-fade-enter-to,
.modal-fade-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
