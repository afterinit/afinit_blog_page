const TokenKey = 'afinit-access-token'
const RefreshTokenKey = 'afinit-refresh-token'
const TokenTypeKey = 'afinit-token-type'
const RememberMeKey = 'afinit-remember-me'
const UserInfoKey = 'afinit-user-info'

export function getToken() {
  return sessionStorage.getItem(TokenKey) || localStorage.getItem(TokenKey)
}

export function getRefreshToken() {
  // 不管有没有勾「记住我」，refresh token 都可能存在（只是存储位置不同）
  return localStorage.getItem(RefreshTokenKey) || sessionStorage.getItem(RefreshTokenKey)
}

export function isAccessTokenExpired() {
  const token = getToken()
  if (!token) return true
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64
    const payload = JSON.parse(atob(padded))
    if (!payload.exp) return false
    return (payload.exp * 1000) < Date.now()
  } catch {
    return false
  }
}

/** 是否存在可恢复的登录会话（access 或 refresh 任一有效即可） */
export function hasAuthSession() {
  return !!(getToken() || getRefreshToken())
}

export function getTokenType() {
  return sessionStorage.getItem(TokenTypeKey) || localStorage.getItem(TokenTypeKey) || 'Bearer'
}

export function isRemembered() {
  return localStorage.getItem(RememberMeKey) === 'true'
}

/** 仅清除凭证，保留用户信息缓存 */
export function clearAuthTokens() {
  localStorage.removeItem(TokenKey)
  localStorage.removeItem(RefreshTokenKey)
  localStorage.removeItem(TokenTypeKey)
  localStorage.removeItem(RememberMeKey)
  sessionStorage.removeItem(TokenKey)
  sessionStorage.removeItem(TokenTypeKey)
  sessionStorage.removeItem(RefreshTokenKey)
}


export function setToken(token, refreshToken, tokenType = 'Bearer', rememberMe = true) {
  clearAuthTokens()

  // rememberMe 只控制持久化方式，不影响是否存储 refresh token
  const storage = rememberMe ? localStorage : sessionStorage
  storage.setItem(TokenKey, token)
  storage.setItem(TokenTypeKey, tokenType || 'Bearer')
  storage.setItem(RefreshTokenKey, refreshToken)

  if (rememberMe) {
    localStorage.setItem(RememberMeKey, 'true')
  }
}

export function setUserInfo(info) {
  localStorage.setItem(UserInfoKey, JSON.stringify(info))
}

export function getUserInfo() {
  const raw = localStorage.getItem(UserInfoKey)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function removeToken() {
  clearAuthTokens()
  localStorage.removeItem(UserInfoKey)
}
