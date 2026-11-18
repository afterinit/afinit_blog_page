import request from '../utils/request.js'
import { assertApiSuccess } from '../utils/apiResponse.js'
import { httpConfig } from '@/config/http.js'

export const API_BASE = httpConfig.baseUrl

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

/** JSON 接口的统一入口，集中处理序列化和 Content-Type。 */
function createJsonOptions({ body, headers, ...options } = {}) {
  return {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

export function fetchJson(endpoint, options = {}) {
  return fetchApi(endpoint, createJsonOptions(options))
}
