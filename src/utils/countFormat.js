/**
 * 将阅读量、点赞数等计数缩写为 k，最多保留一位小数。
 * 例如：999 → 999，1000 → 1k，1500 → 1.5k，10000 → 10k。
 */
export function formatCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count) || count < 0) return '0'
  if (count < 1000) return String(Math.floor(count))

  const thousands = (count / 1000).toFixed(1).replace(/\.0$/, '')
  return `${thousands}k`
}
