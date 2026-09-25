/**
 * apiResponse.js
 *
 * 统一处理后端 JSON 响应的工具函数。
 * 约定：以 res.success 判断业务是否成功。
 */

/** 从响应体中提取提示信息，仅返回 msg 文案，不拼接 code / data */
export function getApiMessage(res, fallback = '请求失败') {
  if (!res || typeof res !== 'object') return fallback
  return res.msg || res.message || fallback
}

/** 提取成功提示 */
export function getApiSuccessMessage(res, fallback = '操作成功') {
  return getApiMessage(res, fallback)
}

/** 判断响应是否成功 */
export function isApiSuccess(res) {
  if (!res || typeof res !== 'object') return false
  return !!res.success
}

/** 断言响应成功，否则抛出错误 */
export function assertApiSuccess(response, res, _, fallback = '请求失败') {
  if (!response.ok) {
    throw new Error(getApiMessage(res, `网络请求失败，HTTP 状态码: ${response.status}`))
  }
  if (!isApiSuccess(res)) {
    throw new Error(getApiMessage(res, fallback))
  }
}
