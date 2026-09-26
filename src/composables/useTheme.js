import { nextTick, ref } from 'vue'

const currentTheme = ref(localStorage.getItem('theme') || 'dark')
let isTransitioning = false

const THEME_COLORS = {
  light: '#fdfdfd',
  dark: '#0a0a0a'
}

function updateBrowserColor(theme) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.dark)
}

function applyTheme(theme, syncBrowserColor = true) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
  if (syncBrowserColor) updateBrowserColor(theme)
}

applyTheme(currentTheme.value)

/** 动画起点：支持传入触摸/点击事件，也支持 ThemeToggle 传入的按钮元素。 */
function getTransitionOrigin(source, useButtonCenter = false) {
  const point = source?.touches?.[0] || source?.changedTouches?.[0] || source
  if (!useButtonCenter && Number.isFinite(point?.clientX) && Number.isFinite(point?.clientY) && (point.clientX !== 0 || point.clientY !== 0)) {
    return { x: point.clientX, y: point.clientY }
  }

  // 手机直接读取按钮矩形，绕过 WebView 合成 click 的坐标；键盘操作也使用这里。
  const element = source instanceof Element ? source : (source?.element || source?.currentTarget || source?.target)
  const rect = element?.getBoundingClientRect?.()
  if (rect?.width > 0 && rect?.height > 0) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const viewport = window.visualViewport
  return {
    x: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) / 2,
    y: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) / 2
  }
}

function getViewportSize() {
  const viewport = window.visualViewport
  return {
    // clientX/clientY 和按钮位置使用布局视口坐标，不能只用缩放后的视觉视口尺寸。
    width: Math.max(window.innerWidth, (viewport?.width ?? 0) + (viewport?.offsetLeft ?? 0)),
    height: Math.max(window.innerHeight, (viewport?.height ?? 0) + (viewport?.offsetTop ?? 0))
  }
}

export function useTheme() {
  const toggleTheme = async (source) => {
    // 多个 ThemeToggle 共享这把锁，避免连点时前一次清理打断后一次动画。
    if (isTransitioning) return

    const previousTheme = currentTheme.value
    const nextTheme = currentTheme.value === 'dark' ? 'light' : 'dark'
    const setTheme = (theme) => {
      currentTheme.value = theme
      // 地址栏颜色在动画结束后再改，避免动画中途浏览器 UI 重绘。
      applyTheme(theme, false)
      // 等按钮图标等 Vue DOM 更新后，再让浏览器捕获新主题。
      return nextTick()
    }
    const updateTheme = () => setTheme(nextTheme)

    const root = document.documentElement
    isTransitioning = true

    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await updateTheme()
        return
      }

      const useSnapshot = window.matchMedia('(max-width: 768px), (pointer: coarse), (hover: none)').matches ||
        typeof document.startViewTransition !== 'function'
      const origin = getTransitionOrigin(source, useSnapshot)

      if (useSnapshot) {
        // 手机使用圆形容器的 GPU transform，不再动画 clip-path。
        root.classList.add('theme-transition-snapshot')
        // 动画实现不进入首屏依赖；旧 WebView 加载失败时直接切换，不能阻断应用挂载。
        try {
          const { revealThemeWithSnapshot } = await import('../utils/themeReveal.js')
          await revealThemeWithSnapshot(origin, updateTheme, () => setTheme(previousTheme))
        } catch (error) {
          console.warn('移动端主题动画不可用，已降级为直接切换。', error)
          await updateTheme()
        }
        return
      }

      // 桌面保留现有 View Transitions 圆形扩散。
      if (!window.CSS?.supports('clip-path', 'circle(0px at 0px 0px)')) {
        await updateTheme()
        return
      }
      const { x, y } = origin
      const { width, height } = getViewportSize()
      const endRadius = Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y)))
      root.style.setProperty('--theme-reveal-x', `${x}px`)
      root.style.setProperty('--theme-reveal-y', `${y}px`)
      root.style.setProperty('--theme-reveal-radius', `${endRadius}px`)
      root.classList.add('theme-transition-circle')
      const transition = document.startViewTransition(updateTheme)
      // 页面隐藏、视口变化等会跳过动画；ready 会拒绝，但主题仍应正常更新。
      transition.ready.catch(() => {})
      await transition.finished
    } catch {
      await updateTheme()
    } finally {
      root.classList.remove('theme-transition-circle', 'theme-transition-snapshot')
      root.style.removeProperty('--theme-reveal-x')
      root.style.removeProperty('--theme-reveal-y')
      root.style.removeProperty('--theme-reveal-radius')
      updateBrowserColor(currentTheme.value)
      isTransitioning = false
    }
  }

  return {
    currentTheme,
    toggleTheme
  }
}
