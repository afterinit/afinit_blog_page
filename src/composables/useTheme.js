import { ref } from 'vue'

const currentTheme = ref(localStorage.getItem('theme') || 'dark')

const THEME_COLORS = {
  light: '#fdfdfd',
  dark: '#0a0a0a'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.dark)
}

applyTheme(currentTheme.value)

/** 动画起点：支持传入触摸/点击事件，也支持 ThemeToggle 传入的按钮元素。 */
function getTransitionOrigin(source) {
  let x = 0, y = 0

  // 1. 如果有触摸点坐标，优先使用
  const touch = source?.touches?.[0] || source?.changedTouches?.[0]
  if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number' && (touch.clientX !== 0 || touch.clientY !== 0)) {
    x = touch.clientX
    y = touch.clientY
  }
  // 2. 如果是鼠标/指针事件，使用其坐标（排除合成事件的 0,0）
  else if (source && typeof source.clientX === 'number' && typeof source.clientY === 'number' && (source.clientX !== 0 || source.clientY !== 0)) {
    x = source.clientX
    y = source.clientY
  }
  // 3. 回退到元素本身的位置
  else {
    const el = source instanceof Element ? source : (source?.currentTarget || source?.target)
    if (el?.getBoundingClientRect) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        x = rect.left + rect.width / 2
        y = rect.top + rect.height / 2
      }
    }
  }

  // 4. 默认屏幕中心
  if (x === 0 && y === 0) {
    const vw = window.visualViewport?.width ?? window.innerWidth
    const vh = window.visualViewport?.height ?? window.innerHeight
    x = vw / 2
    y = vh / 2
  }

  // 关键修复：移动端（特别是 Safari）对于 clipPath 动画的坐标不能带有小数，否则会导致解析失败从而从 0,0 开始扩散
  return { x: Math.round(x), y: Math.round(y) }
}

function getViewportSize() {
  const viewport = window.visualViewport
  return {
    width: viewport?.width ?? window.innerWidth,
    height: Math.max(window.innerHeight, viewport?.height ?? 0)
  }
}

export function useTheme() {
  const toggleTheme = (source) => {
    const nextTheme = currentTheme.value === 'dark' ? 'light' : 'dark'

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentTheme.value = nextTheme
      applyTheme(nextTheme)
      return
    }

    if (!document.startViewTransition) {
      currentTheme.value = nextTheme
      applyTheme(nextTheme)
      return
    }

    // 判断是否为移动端
    const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches

    if (isMobile) {
      // 手机端：不添加任何 CSS class，直接利用原生 startViewTransition 极度丝滑的默认交叉淡入淡出 (Cross-fade) 动画
      // 这能彻底避免 Safari Mobile 对坐标解析混乱导致的“总是从左上角开始扩散”的问题，也避免了各种奇葩白屏崩溃
      document.documentElement.classList.remove('theme-transition-circle')
      document.startViewTransition(() => {
        currentTheme.value = nextTheme
        applyTheme(nextTheme)
      })
      return
    }

    // 电脑端：加上特有 class，执行以点击位置为圆心的扩散动画
    document.documentElement.classList.add('theme-transition-circle')
    const { x, y } = getTransitionOrigin(source)
    const { width, height } = getViewportSize()
    const endRadius = Math.hypot(
      Math.max(x, width - x),
      Math.max(y, height - y)
    )
    const duration = 400

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
    }).catch(() => {})

    transition.finished
      .then(() => {
        document.documentElement.classList.remove('theme-transition-circle')
      })
      .catch(() => {
        document.documentElement.classList.remove('theme-transition-circle')
      })
  }

  return {
    currentTheme,
    toggleTheme
  }
}
