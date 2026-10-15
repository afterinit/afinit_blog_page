import { fetchApi } from './base.js'
import { withQuery } from '@/utils/url.js'

/**
 * 管理员专属接口
 */
export const adminApi = {
  /**
   * 获取用户列表
   * @param {number} page
   * @param {number} size
   * @param {string} keyword
   */
  getUsers(page = 1, size = 15, keyword = '') {
    return fetchApi(withQuery('/admin', { page, size, query: keyword }))
  },

  /**
   * 修改用户状态
   * @param {string|number} id
   * @param {number} status
   */
  updateUserStatus(id, status) {
    return fetchApi(withQuery(`/admin/${id}`, { status }), {
      method: 'PUT'
    })
  },

  /**
   * 将文章公开
   * @param {string|number} id
   */
  publishBlog(id) {
    return fetchApi(`/admin/toPublic/${id}`, {
      method: 'PUT'
    })
  }
}
