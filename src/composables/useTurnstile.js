/**
 * Cloudflare Turnstile 人机验证 — 全局单脚本、多挂载点复用。
 */
import { ref } from 'vue'

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script'
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

/**
 * @param {object} options
 * @param {string} options.containerSelector — 如 '#turnstile-container'
 * @param {(token: string) => void} [options.onSuccess]
 * @param {(code: string) => void} [options.onError]
 * @param {() => void} [options.onExpired]
 * @param {boolean} [options.removeScriptOnUnmount] — 页面卸载时是否移除全局脚本（登录页用）
 */
export function useTurnstile({
  containerSelector,
  onSuccess,
  onError,
  onExpired,
  removeScriptOnUnmount = false,
}) {
  const widgetId = ref(null)
  const scriptLoading = ref(false)

  function render() {
    if (!window.turnstile || !SITE_KEY) return
    if (widgetId.value !== null) {
      window.turnstile.remove(widgetId.value)
      widgetId.value = null
    }
    widgetId.value = window.turnstile.render(containerSelector, {
      sitekey: SITE_KEY,
      callback: (token) => onSuccess?.(token),
      'error-callback': (code) => onError?.(code),
      'expired-callback': () => onExpired?.(),
      theme: 'light',
      language: 'zh-CN',
    })
  }

  function inject() {
    if (!SITE_KEY) {
      console.error('[Turnstile] VITE_TURNSTILE_SITE_KEY 未配置')
      return false
    }
    if (document.getElementById(TURNSTILE_SCRIPT_ID)) {
      if (window.turnstile) render()
      scriptLoading.value = false
      return true
    }

    scriptLoading.value = true
    const script = document.createElement('script')
    script.id = TURNSTILE_SCRIPT_ID
    script.src = `${TURNSTILE_SCRIPT_URL}?render=explicit`
    script.async = true
    script.defer = true
    script.onload = () => {
      scriptLoading.value = false
      render()
    }
    script.onerror = () => {
      scriptLoading.value = false
      onError?.('script_load')
    }
    document.head.appendChild(script)
    return true
  }

  function reset() {
    if (widgetId.value !== null && window.turnstile) {
      window.turnstile.reset(widgetId.value)
    }
  }

  function removeWidget() {
    if (widgetId.value !== null && window.turnstile) {
      window.turnstile.remove(widgetId.value)
      widgetId.value = null
    }
  }

  function cleanup() {
    removeWidget()
    if (removeScriptOnUnmount) {
      document.getElementById(TURNSTILE_SCRIPT_ID)?.remove()
      delete window.turnstile
    }
  }

  return {
    widgetId,
    scriptLoading,
    siteKeyConfigured: !!SITE_KEY,
    inject,
    render,
    reset,
    removeWidget,
    cleanup,
  }
}
