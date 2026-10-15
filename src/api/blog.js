import { fetchApi, fetchJson } from './base.js'
import { withQuery } from '@/utils/url.js'

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
    const path = resolved === 'private'
      ? '/blog/private'
      : resolved === 'personal'
        ? '/blog/personal'
        : '/blog'
    return fetchApi(withQuery(path, { page, size, query: search }))
  },

  /** 获取当前用户点赞的文章 */
  getLikedBlogs(page = 1, size = 10) {
    return fetchApi(withQuery('/blog/like', { page, size }))
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
   * 记录文章阅读量
   * @param {string|number} id
   */
  recordView(id) {
    return fetchApi(`/blog/view/${id}`, {
      method: 'POST',
      credentials: 'include',
      skipAuthRedirect: true
    })
  },

  /** 获取当前用户对文章的点赞状态 */
  getLikeStatus(blogId) {
    return fetchApi(`/like/${blogId}`)
  },

  /** 点赞文章 */
  likeBlog(blogId) {
    return fetchApi(`/like/${blogId}`, {
      method: 'POST'
    })
  },

  /** 取消点赞文章 */
  unlikeBlog(blogId) {
    return fetchApi(`/like/${blogId}`, {
      method: 'DELETE'
    })
  },

  /**
   * 发布新文章
   * @param {string} title
   * @param {string} summary
   * @param {string} content
   */
  createBlog(title, summary, content) {
    return fetchJson('/blog', {
      method: 'POST',
      body: { title, summary, content }
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
    return fetchJson(`/blog/${id}`, {
      method: 'PUT',
      body: { title, summary, content }
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
