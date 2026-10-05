import { fetchApi } from './base.js'

export const barrageApi = {
  /**
   * 获取某篇文章的弹幕
   * @param {string|number} blogId 
   */
  getBarrages(blogId) {
    return fetchApi(`/barrage/${blogId}`)
  },

  /**
   * 发送弹幕
   * @param {string|number} blogId 
   * @param {string} content 
   * @param {string} color 
   * @param {number} scrollPercent
   */
  sendBarrage(blogId, content, color = '#FFFFFF', scrollPercent = 0) {
    return fetchApi('/barrage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blogId: Number(blogId), content, color, scrollPercent })
    })
  },

  /**
   * 删除弹幕
   * @param {string|number} id 
   */
  deleteBarrage(id) {
    return fetchApi(`/barrage/${id}`, {
      method: 'DELETE'
    })
  }
}
