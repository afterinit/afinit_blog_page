/**
 * useUserInfo.js
 *
 * 用户信息的统一获取与本地缓存 composable。
 * 职责：
 *   - 从 GET /user/info 拉取数据并同步到 localStorage
 *   - 对外暴露响应式 userInfo、isLoggedIn、avatarLetter
 *   - 提供 fetchUserInfo() 供需要主动刷新的场景调用
 */

import { ref, computed } from 'vue'
import { getToken, getRefreshToken, getUserInfo, setUserInfo, hasAuthSession } from '../utils/auth.js'
import request, { ensureAccessToken } from '../utils/request.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL

/** 用户信息响应式对象，跨组件共享同一份引用 */
const userInfo = ref(getUserInfo())
const isLoggedIn = ref(hasAuthSession())

/** 头像 URL 缓存破坏版本（同 URL 换图时强制 <img> 重载） */
const avatarCacheKey = ref(0)

/** 头像占位字母 */
const avatarLetter = computed(() => {
  const name = userInfo.value?.nickname ?? ''
  return name.charAt(0).toUpperCase() || 'U'
})

/**
 * 合并更新用户信息并同步 localStorage。
 * @param {Record<string, unknown>} partial
 */
function patchUserInfo(partial) {
  if (!partial || typeof partial !== 'object') return
  userInfo.value = { ...(userInfo.value || {}), ...partial }
  setUserInfo(userInfo.value)
  if ('avatar' in partial) {
    avatarCacheKey.value += 1
  }
}

/** 为头像 URL 附加缓存破坏参数，避免浏览器沿用旧图 */
function resolveAvatarUrl(url) {
  if (!url) return ''
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_v=${avatarCacheKey.value}`
}

async function fetchUserInfo() {
  if (!hasAuthSession()) return

  try {
    if (!getToken() && getRefreshToken()) {
      await ensureAccessToken({ force: true })
    }

    const response = await request(`${API_BASE}/user/info`, {
      skipAuthRedirect: true
    })
    const json = await response.json()
    if (response.ok && String(json?.code) === '20031' && json.data) {
      const prevAvatar = userInfo.value?.avatar
      userInfo.value = json.data
      setUserInfo(json.data)
      isLoggedIn.value = true
      if (json.data.avatar && json.data.avatar !== prevAvatar) {
        avatarCacheKey.value += 1
      }
    }
  } catch (err) {
    // 网络异常或鉴权失败时静默忽略，保留本地缓存
    if (!hasAuthSession()) {
      clearUserInfo()
    }
  }
}

/** 登出时重置本地状态 */
function clearUserInfo() {
  userInfo.value = null
  isLoggedIn.value = false
}

/** 登录成功后更新状态 */
function markLoggedIn() {
  isLoggedIn.value = true
  userInfo.value = getUserInfo()
}

export function useUserInfo() {
  return {
    userInfo,
    isLoggedIn,
    avatarLetter,
    avatarCacheKey,
    fetchUserInfo,
    patchUserInfo,
    resolveAvatarUrl,
    clearUserInfo,
    markLoggedIn,
  }
}
