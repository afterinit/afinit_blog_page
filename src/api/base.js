import request from '../utils/request.js'
import { assertApiSuccess } from '../utils/apiResponse.js'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

/**
 * 封装底层的 API 请求逻辑，自动拼接基础 URL，解析 JSON，并进行成功断言。
 * @param {string} endpoint - 接口路径，例如 '/user/login'
 * @param {object} options - fetch 选项
 * @returns {Promise<any>} 返回后端响应的 JSON 完整对象
 */
export async function fetchApi(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
  const response = await request(url, options)

  // 对于 204 No Content，直接返回成功状态
  if (response.status === 204) {
    return { success: true, data: null, msg: '成功' }
  }

  // 尝试解析 JSON
  let res
  try {
    res = await response.json()
  } catch (err) {
    if (!response.ok) {
      throw new Error(`网络请求失败，状态码: ${response.status}`)
    }
    // 如果响应不是 JSON 但是 ok，返回纯文本或占位
    return { success: true, data: null }
  }

  // 断言业务成功
  assertApiSuccess(response, res)

  return res
}

/**
 * 下载类接口：返回 blob 与可选文件名（不走 JSON 断言）
 * @param {string} endpoint
 * @param {object} options
 * @returns {Promise<{ blob: Blob, filename: string|null, response: any }>}
 */
export async function fetchBlob(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
  const response = await request(url, {
    ...options,
    responseType: 'blob'
  })

  if (!response.ok) {
    throw new Error(`网络请求失败，状态码: ${response.status}`)
  }

  const blob = await response.blob()
  let filename = null
  const disposition = response.headers.get('content-disposition')
  if (disposition) {
    const utf8Match = /filename\*=UTF-8''([^;\n]*)/i.exec(disposition)
    if (utf8Match?.[1]) {
      filename = decodeURIComponent(utf8Match[1])
    } else {
      const plainMatch = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i.exec(disposition)
      if (plainMatch?.[1]) {
        filename = plainMatch[1].replace(/['"]/g, '')
      }
    }
  }

  return { blob, filename, response }
}
