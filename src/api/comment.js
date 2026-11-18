import { fetchApi, fetchJson } from './base.js'

/**
 * 评论相关 API
 */
export const commentApi = {
  /**
   * 获取文章总评论数
   * GET /comment/{blogId}
   * @param {string|number} blogId - 文章ID (必填)
   */
  getCommentCount(blogId) {
    if (!blogId) {
      throw new Error('文章ID不能为空')
    }
    return fetchApi(`/comment/${blogId}`)
  },

  /**
   * 获取评论列表
   * GET /comment?page=1&size=10&blogId=xxx(&parentId=xxx)
   * 必填必要字段：blogId
   * 
   * @param {Object} params
   * @param {string|number} params.blogId - 文章ID (必填必要字段)
   * @param {number} [params.page=1] - 当前页码
   * @param {number} [params.size=10] - 每页数量
   * @param {string|number} [params.parentId] - 父评论ID (查询二级回复时填根评论ID)
   */
  getComments({ blogId, page = 1, size = 10, parentId } = {}) {
    if (!blogId) {
      throw new Error('文章ID不能为空')
    }

    const query = new URLSearchParams()
    query.set('page', String(page))
    query.set('size', String(size))
    query.set('blogId', String(blogId))

    if (parentId !== undefined && parentId !== null && parentId !== '') {
      query.set('parentId', String(parentId))
    }

    return fetchApi(`/comment?${query.toString()}`)
  },

  /**
   * 发表评论 / 回复
   * POST /comment
   * 必填必要字段：blogId, content
   * 
   * @param {Object} data
   * @param {string|number} data.blogId - 文章ID (必填)
   * @param {string} data.content - 评论内容 (必填)
   * @param {string|number} [data.parentId] - 父评论ID (二级回复时填根评论ID)
   * @param {string|number} [data.replyId] - 回复目标ID (回复根评论与parentId一致，回复子评论为子评论ID)
   * @param {string|number} [data.replyUserId] - 被回复人用户ID (回复给谁就填谁的用户id)
   */
  sendComment({ blogId, content, parentId, replyId, replyUserId } = {}) {
    if (!blogId) {
      throw new Error('文章ID不能为空')
    }

    const body = {
      blogId: String(blogId),
      content: content ? content.trim() : ''
    }
    if (parentId !== undefined && parentId !== null && parentId !== '') {
      body.parentId = String(parentId)
    }
    if (replyId !== undefined && replyId !== null && replyId !== '') {
      body.replyId = String(replyId)
    }
    if (replyUserId !== undefined && replyUserId !== null && replyUserId !== '') {
      body.replyUserId = String(replyUserId)
    }

    return fetchJson('/comment', {
      method: 'POST',
      body
    })
  },

  /**
   * 删除评论
   * DELETE /comment/{commentId}
   * @param {string|number} commentId - 评论ID (必填)
   */
  deleteComment(commentId) {
    if (!commentId) {
      throw new Error('评论ID不能为空')
    }
    return fetchApi(`/comment/${commentId}`, {
      method: 'DELETE'
    })
  }
}
