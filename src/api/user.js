import { fetchApi } from './base.js'

/**
 * 用户自助接口（当前登录用户）
 */
export const userApi = {
  /**
   * 获取当前用户信息
   * @param {boolean} skipAuthRedirect - 是否跳过未授权时的重定向
   */
  getUserInfo(skipAuthRedirect = false) {
    return fetchApi('/user/info', {
      skipAuthRedirect
    })
  },

  /**
   * 更新用户昵称
   * @param {string} nickname
   */
  updateNickname(nickname) {
    return fetchApi('/user/nickname', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname })
    })
  },

  /**
   * 更新用户信息（用户名 / 密码等，需验证码）
   * @param {object} data
   */
  updateUserInfo(data) {
    return fetchApi('/user/info', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  },

  /**
   * 上传头像
   * @param {File|Blob} file
   */
  uploadAvatar(file) {
    const formData = new FormData()
    formData.append('file', file, 'avatar.jpg')
    return fetchApi('/user/avatar', {
      method: 'POST',
      body: formData
    })
  },

  /**
   * 注销账号
   * @param {string|number} id
   */
  deleteUser(id) {
    return fetchApi(`/user/${id}`, {
      method: 'DELETE'
    })
  }
}
