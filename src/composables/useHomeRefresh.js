/**
 * 首页（BlogList）数据刷新协调器 — 模块级单例。
 *
 * BlogList 在挂载时注册刷新函数；其它页面在数据变更后调用 refreshHome*，
 * 或通过 router.afterEach 在进入首页时自动触发。
 */

/** @type {((scope: { posts?: boolean, user?: boolean }) => void | Promise<void>) | null} */
let refreshHandler = null

/**
 * 由 BlogList 注册首页刷新实现，返回注销函数。
 * @param {(scope: { posts?: boolean, user?: boolean }) => void | Promise<void>} handler
 */
export function registerHomeRefresh(handler) {
  refreshHandler = handler
  return () => {
    if (refreshHandler === handler) {
      refreshHandler = null
    }
  }
}

/**
 * 刷新首页数据（BlogList 未挂载时静默忽略）。
 * @param {{ posts?: boolean, user?: boolean }} [scope]
 */
export async function refreshHomeData(scope = { posts: true, user: true }) {
  await refreshHandler?.(scope)
}

export function refreshHomePosts() {
  return refreshHomeData({ posts: true, user: false })
}

export function refreshHomeUser() {
  return refreshHomeData({ posts: false, user: true })
}
