/**
 * 个人资料文章列表刷新协调器。
 *
 * 文章详情页只负责标记数据已变化；已缓存的个人资料页会立即在后台刷新，
 * 尚未挂载时则保留标记，等页面注册刷新函数后再处理。
 */

let refreshHandler = null
let listsDirty = false
let refreshPromise = null

export function registerProfileListsRefresh(handler) {
  refreshHandler = handler
  return () => {
    if (refreshHandler === handler) refreshHandler = null
  }
}

export async function refreshInvalidatedProfileLists() {
  if (refreshPromise) {
    await refreshPromise
    // 刷新期间若又发生了新的操作，继续补一次刷新，避免吞掉后续变更。
    if (listsDirty) await refreshInvalidatedProfileLists()
    return true
  }
  if (!listsDirty || !refreshHandler) return false

  listsDirty = false
  refreshPromise = Promise.resolve(refreshHandler())
    .catch(() => {
      // 网络失败时保留失效标记，下次进入个人资料页继续尝试。
      listsDirty = true
    })
    .finally(() => {
      refreshPromise = null
    })

  await refreshPromise
  return true
}

export function invalidateProfileLists() {
  listsDirty = true
  return refreshInvalidatedProfileLists()
}
