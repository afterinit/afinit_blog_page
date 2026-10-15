import { appConfig } from '@/config/app.js'

const namespaced = (key) => `${appConfig.storagePrefix}-${key}`

export const STORAGE_KEYS = Object.freeze({
  ACCESS_TOKEN: namespaced('access-token'),
  REFRESH_TOKEN: namespaced('refresh-token'),
  TOKEN_TYPE: namespaced('token-type'),
  REMEMBER_ME: namespaced('remember-me'),
  USER_INFO: namespaced('user-info'),
  THEME: 'theme',
})
