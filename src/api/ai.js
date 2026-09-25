import { API_BASE } from './base.js'
import { getToken, getTokenType } from '../utils/auth.js'

/**
 * AI 相关接口（流式用原生 fetch，便于读取 ReadableStream）
 */
export const aiApi = {
  /**
   * 发起文章问答 SSE 流
   * @param {string|number} blogId
   * @param {string} question
   * @returns {Promise<Response>}
   */
  streamQuestion(blogId, question) {
    const token = getToken()
    const tokenType = getTokenType() || 'Bearer'
    return fetch(`${API_BASE}/ai/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `${tokenType} ${token}` : ''
      },
      body: JSON.stringify({
        blogId: String(blogId),
        question
      })
    })
  }
}
