/**
 * useAuthGuard.js
 *
 * 全局登录过期处理。
 * 当 request.js 检测到 401 且 refresh 失败时调用 onAuthExpired()，
 * 弹出浏览器原生提示并跳转到登录页。
 *
 * 使用 window.alert 而非 Vue 响应式弹窗，确保在任何异步/异常场景下
 * 都能可靠地通知用户（Vue 的响应式更新可能被后续的 throw AuthError 干扰）。
 */

import { ref } from 'vue'
import { removeToken } from '../utils/auth.js'

export const showAuthExpiredModal = ref(false)

export function onAuthExpired() {
  removeToken()
  showAuthExpiredModal.value = true
}

export function closeAuthExpiredModal() {
  showAuthExpiredModal.value = false
  window.location.href = '/login'
}

export function cancelAuthExpiredModal() {
  showAuthExpiredModal.value = false
}
