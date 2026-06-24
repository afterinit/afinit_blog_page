/**
 * 安全解析 JSON，将超长整数字面量转为字符串，避免雪花 ID 精度丢失。
 */
export function parseJsonSafe(text) {
  if (text === null || text === undefined || text === '') return null
  const raw = typeof text === 'string' ? text : String(text)
  const safe = raw.replace(/([:\[,]\s*)(-?\d{16,})(?=[,\]\}\s])/g, '$1"$2"')
  return JSON.parse(safe)
}

/** 从响应文本中提取 data 字段的长整型 ID（字符串） */
export function extractDataIdFromJsonText(text) {
  const match = text.match(/"data"\s*:\s*(\d+)/)
  return match ? match[1] : ''
}
