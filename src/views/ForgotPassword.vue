<script setup>
import { reactive, ref, computed, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import SHA256 from 'crypto-js/sha256'
import { useTurnstile } from '../composables/useTurnstile.js'
import { authApi } from '../api/auth.js'

const router = useRouter()

const form = reactive({
  username: '',
  password: '',
  code:     '',
})

const isSubmitting = ref(false)
const isSending = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const countdown = ref(0)
let countdownTimer = null

const showTurnstileModal = ref(false)

const turnstile = useTurnstile({
  containerSelector: '#turnstile-forgot-container',
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

const canGetCode = computed(() => countdown.value === 0 && !isSending.value)

const codeBtnText = computed(() => {
  if (isSending.value) return '发送中…'
  if (countdown.value > 0) return `${countdown.value}s 后重发`
  return '获取验证码'
})

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

async function handleGetCode() {
  if (!canGetCode.value) return

  errorMsg.value = ''

  if (!form.username.trim()) {
    showError('请先输入用户名')
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

async function sendVerificationCode(cfToken) {
  isSending.value = true
  try {
    await authApi.sendCode({ cfToken, username: form.username.trim() })

    closeTurnstileModal()
    startCountdown()
    showSuccess('验证码已发送，请查收绑定邮箱')
  } catch (err) {
    closeTurnstileModal()
    showError(err.message || '验证码发送失败，请稍后重试')
  } finally {
    isSending.value = false
  }
}

async function handleResetPassword() {
  errorMsg.value = ''

  const username = form.username.trim()

  if (!username || !form.password || !form.code) {
    showError('请填写所有必填项')
    return
  }
  if (form.password.length < 6 || form.password.length > 30) {
    showError('密码长度必须在 6 - 30 个字符之间')
    return
  }
  if (form.code.length !== 6) {
    showError('验证码必须为 6 位数字')
    return
  }

  isSubmitting.value = true
  try {
    const res = await authApi.resetPassword(
      username,
      SHA256(form.password).toString(),
      form.code
    )
    
    showSuccess(res.msg || res.message || '密码修改成功！即将返回登录页…')
    setTimeout(() => router.push('/login'), 1500)
  } catch (err) {
    showError(err.message || '修改失败，请稍后重试')
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
  <div class="forgot-container">
    <Transition name="fade">
      <div v-if="isSubmitting" class="loading-overlay">
        <div class="spinner"></div>
      </div>
    </Transition>

    <div class="forgot-box">
      <h2>找回密码</h2>

      <!-- 用户名 -->
      <div class="form-group">
        <label for="forgot-username">用户名</label>
        <input
          id="forgot-username"
          v-model.trim="form.username"
          type="text"
          placeholder="请输入用户名"
          autocomplete="username"
          :disabled="isSubmitting"
        />
      </div>

      <!-- 验证码 -->
      <div class="form-group">
        <label for="forgot-code">邮箱验证码</label>
        <div class="code-row">
          <input
            id="forgot-code"
            v-model.trim="form.code"
            type="text"
            placeholder="请输入 6 位验证码"
            maxlength="6"
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

      <!-- 新密码 -->
      <div class="form-group">
        <label for="forgot-password">新密码</label>
        <input
          id="forgot-password"
          v-model="form.password"
          type="password"
          placeholder="请输入新密码（至少 6 位）"
          autocomplete="new-password"
          :disabled="isSubmitting"
          @keyup.enter="handleResetPassword"
        />
      </div>

      <!-- 错误 / 成功提示 -->
      <p v-if="errorMsg" class="feedback-msg error-msg" role="alert">{{ errorMsg }}</p>
      <p v-if="successMsg" class="feedback-msg success-msg" role="status">{{ successMsg }}</p>

      <!-- 确认按钮 -->
      <button
        class="btn main-btn"
        :disabled="isSubmitting"
        @click="handleResetPassword"
      >
        {{ isSubmitting ? '提交中…' : '确认重置' }}
      </button>

      <!-- 返回登录 -->
      <button class="btn secondary-btn" @click="router.push('/login')" :disabled="isSubmitting">
        返回登录
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
            <div v-if="turnstile.scriptLoading.value" class="turnstile-skeleton">
              <div class="skeleton-shimmer"></div>
            </div>
            <div id="turnstile-forgot-container"></div>
          </div>

          <p class="modal-hint">验证通过后将自动发送验证码</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ── 布局 ──────────────────────────────────────────────────────────────────── */
.forgot-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: var(--bg-primary);
  position: relative;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-primary);
  opacity: 0.75;
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-color);
  border-top-color: var(--text-primary);
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

.forgot-box {
  background: var(--bg-secondary);
  padding: 40px;
  border: 1px solid var(--border-color);
  width: 100%;
  max-width: 400px;
}

.forgot-box h2 {
  margin: 0 0 24px;
  text-align: center;
  color: var(--text-primary);
  font-weight: 600;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  margin-bottom: 7px;
  font-size: 14px;
  color: var(--text-secondary);
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  font-size: 14px;
  box-sizing: border-box;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.form-group input:focus {
  border-color: var(--text-primary);
}

.form-group input:disabled {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.code-row {
  display: flex;
  gap: 8px;
}

.code-row input {
  flex: 1;
  min-width: 0;
}

.feedback-msg {
  margin: 0 0 16px;
  padding: 8px 12px;
  font-size: 13px;
  text-align: center;
}

.error-msg {
  background: rgba(211, 47, 47, 0.1);
  color: var(--danger-color);
  border: 1px solid var(--danger-color);
}

.success-msg {
  background: rgba(46, 125, 50, 0.1);
  color: var(--success-color);
  border: 1px solid var(--success-color);
}

.btn {
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s, border-color 0.2s;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.code-btn {
  flex-shrink: 0;
  padding: 10px 14px;
  background-color: var(--text-primary);
  color: var(--bg-primary);
  white-space: nowrap;
  font-size: 13px;
}

.code-btn:hover:not(:disabled) {
  background-color: var(--accent-hover);
}

.code-btn:disabled {
  background-color: var(--text-secondary);
}

.main-btn {
  width: 100%;
  padding: 12px;
  background-color: var(--text-primary);
  color: var(--bg-primary);
  font-size: 15px;
  margin-bottom: 10px;
}

.main-btn:hover:not(:disabled) {
  background-color: var(--accent-hover);
}

.main-btn:disabled {
  background-color: var(--text-secondary);
}

.secondary-btn {
  width: 100%;
  padding: 12px;
  background-color: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  font-size: 14px;
}

.secondary-btn:hover:not(:disabled) {
  background-color: var(--bg-hover);
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

/* ── Turnstile Modal ────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 24px;
  width: 340px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 2px 6px;
  transition: background 0.15s, color 0.15s;
}

.modal-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.modal-body {
  display: flex;
  justify-content: center;
  min-height: 65px;
}

.turnstile-skeleton {
  width: 300px;
  height: 65px;
  overflow: hidden;
  background: var(--bg-hover);
  position: relative;
}

.skeleton-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
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
  color: var(--text-secondary);
}

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
