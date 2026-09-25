import { ref } from 'vue'

const currentTheme = ref(localStorage.getItem('theme') || 'dark')

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}

// 初始化主题
applyTheme(currentTheme.value)

/** 动画起点：优先点击/触摸坐标，回退到按钮中心（手机端更稳） */
function getTransitionOrigin(event) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0]
  if (touch && Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY)) {
    return { x: touch.clientX, y: touch.clientY }
  }

  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return { x: event.clientX, y: event.clientY }
  }

  const el = event?.currentTarget
  if (el?.getBoundingClientRect) {
    const rect = el.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }
  }

  const vw = window.visualViewport?.width ?? window.innerWidth
  const vh = window.visualViewport?.height ?? window.innerHeight
  return { x: vw / 2, y: vh / 2 }
}

function getViewportSize() {
  // 手机端地址栏伸缩时 visualViewport 更准
  const vv = window.visualViewport
  return {
    width: vv?.width ?? window.innerWidth,
    height: Math.max(window.innerHeight, vv?.height ?? 0)
  }
}

export function useTheme() {
  const toggleTheme = (event) => {
    const isDark = currentTheme.value === 'dark'
    const nextTheme = isDark ? 'light' : 'dark'

    // 仅在不支持 API 或系统要求减少动效时跳过圆形过渡
    if (
      !document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      currentTheme.value = nextTheme
      applyTheme(nextTheme)
      return
    }

    const { x, y } = getTransitionOrigin(event)
    const { width, height } = getViewportSize()
    const endRadius = Math.hypot(
      Math.max(x, width - x),
      Math.max(y, height - y)
    )

    // 手机端稍慢一点，圆形扩散更顺滑
    const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches
    const duration = isMobile ? 550 : 400

    const transition = document.startViewTransition(() => {
      currentTheme.value = nextTheme
      applyTheme(nextTheme)
    })

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration,
          easing: 'ease-out',
          pseudoElement: '::view-transition-new(root)'
        }
      )
    }).catch(() => {
      // ready 被中断时主题已切完，忽略即可
    })
  }

  return {
    currentTheme,
    toggleTheme
  }
}
