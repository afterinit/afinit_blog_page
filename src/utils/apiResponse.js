/**
 * apiResponse.js
 *
 * 统一处理后端 JSON 响应的工具函数。
 * 约定：code 以 1 结尾表示成功（如 20011、30021）。
 */

const DEFAULT_SUCCESS_CODES = ['200']

function isSuccessCode(code, extraCodes = []) {
  const text = String(code ?? '')
  if (!text) return false
  if (text.endsWith('1')) return true
  const accepted = new Set([...DEFAULT_SUCCESS_CODES, ...extraCodes].map(String))
  return accepted.has(text)
}

/** 从响应体中提取提示信息，仅返回 msg 文案，不拼接 code / data */
export function getApiMessage(res, fallback = '请求失败') {
  if (!res || typeof res !== 'object') return fallback
  return res.msg || res.message || fallback
}

/** 提取成功提示 */
export function getApiSuccessMessage(res, fallback = '操作成功') {
  if (!res || typeof res !== 'object') return fallback
  return res.msg || res.message || fallback
}

/** 判断响应是否成功 */
export function isApiSuccess(res, successCodes = []) {
  if (!res || typeof res !== 'object') return false
  if (typeof res.success === 'boolean') return res.success
  if (res.data === false) return false
  return isSuccessCode(res.code, successCodes)
}

/** 断言响应成功，否则抛出错误 */
export function assertApiSuccess(response, res, successCodes = [], fallback = '请求失败') {
  if (!response.ok) {
    throw new Error(getApiMessage(res, `网络请求失败，HTTP 状态码: ${response.status}`))
  }
  if (!isApiSuccess(res, successCodes)) {
    throw new Error(getApiMessage(res, fallback))
  }
}
