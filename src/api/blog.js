import { fetchApi } from './base.js'

export const blogApi = {
  /**
   * 获取文章列表
   * @param {number} page 
   * @param {number} size 
   * @param {boolean} isPrivate - 是否请求私有文章列表
   * @param {string} search - 搜索关键字
   */
  getBlogList(page = 1, size = 15, isPrivate = false, search = '') {
    const endpoint = isPrivate 
      ? `/blog/personal?page=${page}&size=${size}`
      : `/blog?page=${page}&size=${size}`
    const query = search ? `&query=${encodeURIComponent(search)}` : ''
    return fetchApi(`${endpoint}${query}`)
  },

  /**
   * 获取文章详情
   * @param {string|number} id 
   * @param {boolean} isPrivate 
   */
  getBlogDetail(id, isPrivate = false) {
    const endpoint = isPrivate ? `/blog/personal/${id}` : `/blog/${id}`
    return fetchApi(endpoint)
  },

  /**
   * 发布新文章
   * @param {string} title 
   * @param {string} summary 
   * @param {string} content 
   */
  createBlog(title, summary, content) {
    return fetchApi('/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary, content })
    })
  },

  /**
   * 更新文章
   * @param {string|number} id 
   * @param {string} title 
   * @param {string} summary 
   * @param {string} content 
   */
  updateBlog(id, title, summary, content) {
    return fetchApi(`/blog/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary, content })
    })
  },

  /**
   * 删除文章
   * @param {string|number} id
   */
  deleteBlog(id) {
    return fetchApi(`/blog/${id}`, {
      method: 'DELETE'
    })
  }
}
