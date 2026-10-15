import { appConfig } from '@/config/app.js'

export const HTTP_HEADERS = Object.freeze({
  CLIENT_TYPE: 'X-Client-Type',
  REFRESH_TOKEN: 'X-Refresh-Token',
})

export const httpConfig = Object.freeze({
  baseUrl: appConfig.apiBaseUrl,
  timeout: 60_000,
  clientType: 'web',
  defaultTokenType: 'Bearer',
  refreshPath: '/user/refresh',
  publicAuthPaths: ['/user/login', '/user/register', '/user/refresh'],
})
