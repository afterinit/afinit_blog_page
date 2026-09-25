import { fetchApi } from './base.js'

/**
 * 解析列表/详情作用域
 * @param {boolean|string} scope - false/'public' | true/'personal' | 'private'
 */
function resolveScope(scope) {
  if (scope === true || scope === 'personal') return 'personal'
  if (scope === 'private') return 'private'
  return 'public'
}

export const blogApi = {
  /**
   * 获取文章列表
   * @param {number} page
   * @param {number} size
   * @param {boolean|string} scope - false/'public' | true/'personal' | 'private'
   * @param {string} search - 搜索关键字
   */
  getBlogList(page = 1, size = 15, scope = 'public', search = '') {
    const resolved = resolveScope(scope)
    const endpoint = resolved === 'private'
      ? `/blog/private?page=${page}&size=${size}`
      : resolved === 'personal'
        ? `/blog/personal?page=${page}&size=${size}`
        : `/blog?page=${page}&size=${size}`
    const query = search ? `&query=${encodeURIComponent(search)}` : ''
    return fetchApi(`${endpoint}${query}`)
  },

  /**
   * 获取文章详情
   * @param {string|number} id
   * @param {boolean|string} scope - false/'public' | true/'personal' | 'private'
   */
  getBlogDetail(id, scope = 'public') {
    const resolved = resolveScope(scope)
    const endpoint = resolved === 'private'
      ? `/blog/private/${id}`
      : resolved === 'personal'
        ? `/blog/personal/${id}`
        : `/blog/${id}`
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
