import { fetchApi } from './base.js'

export const authApi = {
  /**
   * 登录
   * @param {string} username
   * @param {string} password
   * @param {string} cfToken
   */
  login(username, password, cfToken) {
    return fetchApi('/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, cfToken })
    })
  },

  /**
   * 注册
   * @param {string} username
   * @param {string} password
   * @param {string} email
   * @param {string} code - 验证码
   */
  register(username, password, email, code) {
    return fetchApi('/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email, code })
    })
  },

  /**
   * 发送验证码
   * @param {object} payload - { cfToken, to } (注册) 或 { cfToken, username } (找回密码)
   */
  sendCode(payload) {
    return fetchApi('/user/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  },

  /**
   * 忘记密码（重置密码）
   * @param {string} username
   * @param {string} password
   * @param {string} code
   */
  resetPassword(username, password, code) {
    return fetchApi('/user/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, code })
    })
  }
}
