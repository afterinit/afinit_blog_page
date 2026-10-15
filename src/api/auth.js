import { fetchJson } from './base.js'

export const authApi = {
  /**
   * 登录
   * @param {string} username
   * @param {string} password
   * @param {string} cfToken
   */
  login(username, password, cfToken) {
    return fetchJson('/user/login', {
      method: 'POST',
      body: { username, password, cfToken }
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
    return fetchJson('/user/register', {
      method: 'POST',
      body: { username, password, email, code }
    })
  },

  /**
   * 发送验证码
   * @param {object} payload - { cfToken, to } (注册) 或 { cfToken, username } (找回密码)
   */
  sendCode(payload) {
    return fetchJson('/user/code', {
      method: 'POST',
      body: payload
    })
  },

  /**
   * 忘记密码（重置密码）
   * @param {string} username
   * @param {string} password
   * @param {string} code
   */
  resetPassword(username, password, code) {
    return fetchJson('/user/password', {
      method: 'PUT',
      body: { username, password, code }
    })
  }
}
