import axios from 'axios'
import { getToken, getRefreshToken, getTokenType, setToken, isRemembered } from './auth.js'
import { parseJsonSafe } from './json.js'
import { onAuthExpired } from '../composables/useAuthGuard.js'

// ─── AuthError ─────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message = '登录已过期，请重新登录') {
    super(message)
    this.name = 'AuthError'
    this.isAuthError = true
  }
}

// ─── Axios 实例 ────────────────────────────────────────────────────────────────

const http = axios.create({
  timeout: 15000,
  validateStatus: () => true,
  transformResponse: [(data) => data],
})

const refreshHttp = axios.create({
  timeout: 15000,
  validateStatus: () => true,
  transformResponse: [(data) => data],
})

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function isAuthRequest(url = '') {
  return url.includes('/user/login') || url.includes('/user/register') || url.includes('/user/refresh')
}

function isRefreshRequest(url = '') {
  return url.includes('/user/refresh')
}

function parseBody(data) {
  if (data == null || data === '') return null
  if (typeof data === 'object') return data
  try {
    return typeof data === 'string' ? parseJsonSafe(data) : data
  } catch {
    return data
  }
}

function stringifyBody(data) {
  if (data == null) return ''
  return typeof data === 'string' ? data : JSON.stringify(data)
}

function createFetchResponse(response) {
  const { data, status, statusText, config } = response
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    url: config.url,
    headers: {
      get(name) {
        const key = Object.keys(response.headers || {})
          .find(k => k.toLowerCase() === String(name).toLowerCase())
        return key ? response.headers[key] : null
      },
    },
    json: async () => parseBody(data),
    text: async () => stringifyBody(data),
    blob: async () => data,
  }
}

/**
 * 处理登录过期：清除凭证 + 触发全局过期弹窗。
 * skipRedirect 为 true 时只清凭证、不弹窗（如静默请求场景）。
 */
function handleAuthFailure(skipRedirect = false) {
  if (skipRedirect) return
  onAuthExpired()
}

async function isBusinessAuthError(response) {
  let data = response.data
  if (data instanceof Blob && data.type.includes('application/json')) {
    try {
      data = JSON.parse(await data.text())
    } catch {
      // Ignore
    }
  } else {
    data = parseBody(data)
  }
  const code = String(data?.code)
  return ['20410', '20412', '20413'].includes(code)
}

function applyAuthHeader(config) {
  const token = getToken()
  config.headers = config.headers || {}
  if (token) {
    config.headers.Authorization = `${getTokenType()} ${token}`
  } else {
    delete config.headers.Authorization
  }
}

async function retryWithFreshToken(config) {
  config._retry = true
  await runTokenRefresh()
  applyAuthHeader(config)
  return http(config)
}

// ─── Token 刷新 ────────────────────────────────────────────────────────────────

let refreshPromise = null
let lastTokenRefreshAt = 0

function extractTokenData(result) {
  const raw = result?.data ?? result
  return {
    accessToken: raw?.accessToken ?? raw?.access_token,
    refreshToken: raw?.refreshToken ?? raw?.refresh_token,
    tokenType: raw?.tokenType ?? raw?.token_type ?? 'Bearer',
  }
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new AuthError()

  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const headers = { 'X-Client-Type': 'web', 'X-Refresh-Token': refreshToken }
  const token = getToken()
  if (token) headers.Authorization = `${getTokenType()} ${token}`

  const response = await refreshHttp.post(`${apiUrl}/user/refresh`, null, { headers })
  const tokenData = extractTokenData(parseBody(response.data))

  if (response.status === 401 || !tokenData.accessToken) {
    handleAuthFailure(false)
    throw new AuthError()
  }

  setToken(tokenData.accessToken, tokenData.refreshToken || refreshToken, tokenData.tokenType, isRemembered())
  lastTokenRefreshAt = Date.now()
  return tokenData
}

/** 全局唯一的 token 刷新入口，防止并发刷新 */
function runTokenRefresh() {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken()
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

// ─── 公开 API ──────────────────────────────────────────────────────────────────

export async function ensureAccessToken({ force = false } = {}) {
  if (!force && getToken()) return getToken()
  if (!getRefreshToken()) throw new AuthError()
  const tokenData = await runTokenRefresh()
  return tokenData.accessToken
}

export async function syncTokenAfterAvatarUpload(uploadStartedAt) {
  if (!getRefreshToken()) return
  if (lastTokenRefreshAt >= uploadStartedAt) return getToken()
  return ensureAccessToken({ force: true })
}

// ─── 拦截器 ────────────────────────────────────────────────────────────────────

http.interceptors.request.use((config) => {
  config.headers = config.headers || {}
  config.headers['X-Client-Type'] = 'web'

  if (!isAuthRequest(config.url)) {
    const token = getToken()
    if (token) config.headers.Authorization = `${getTokenType()} ${token}`
  }
  return config
})

http.interceptors.response.use(
  // ── 成功处理器（收到 HTTP 响应，包括 401） ──
  async (response) => {
    if (response.status !== 401 && !(await isBusinessAuthError(response))) {
      return response
    }
    
    if (isRefreshRequest(response.config.url)) {
      handleAuthFailure(false)
      throw new AuthError()
    }

    if (isAuthRequest(response.config.url)) {
      return response
    }

    const originalConfig = response.config
    if (originalConfig._retry) return response

    // 无 refresh token，直接过期
    if (!getRefreshToken()) {
      handleAuthFailure(originalConfig.skipAuthRedirect)
      throw new AuthError()
    }

    try {
      return await retryWithFreshToken(originalConfig)
    } catch (e) {
      handleAuthFailure(originalConfig.skipAuthRedirect)
      throw new AuthError()
    }
  },

  // ── 错误处理器（网络异常 / CORS 拦截 / 超时等，无 response 对象） ──
  async (error) => {
    const originalConfig = error?.config

    if (originalConfig && !originalConfig._retry && !isAuthRequest(originalConfig.url)) {
      const hasToken = !!getToken()
      const hasRefresh = !!getRefreshToken()

      // 有 token 也有 refresh，尝试刷新
      if (hasToken && hasRefresh) {
        try {
          return await retryWithFreshToken(originalConfig)
        } catch (e) {
          handleAuthFailure(originalConfig.skipAuthRedirect)
          throw new AuthError()
        }
      }

      // 其他情况（只有 token 没 refresh，或者都没），且产生了错误，大概率是 401 引起的 CORS 拦截
      // 直接触发过期弹窗
      handleAuthFailure(originalConfig.skipAuthRedirect)
      throw new AuthError()
    }

    // 如果不是我们管的请求，原样抛出
    return Promise.reject(error)
  }
)

// ─── 统一请求出口 ──────────────────────────────────────────────────────────────

export default function request(url, options = {}) {
  const config = {
    url,
    method: options.method || 'GET',
    headers: options.headers || {},
  }
  if (options.body !== undefined) config.data = options.body
  if (options.skipAuthRedirect) config.skipAuthRedirect = true
  if (options.responseType) config.responseType = options.responseType

  return http(config).then(createFetchResponse)
}
