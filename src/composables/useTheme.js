import { ref, watch } from 'vue'

const currentTheme = ref(localStorage.getItem('theme') || 'dark')

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}

// 初始化主题
applyTheme(currentTheme.value)

export function useTheme() {
  const toggleTheme = (event) => {
    const isDark = currentTheme.value === 'dark'
    const nextTheme = isDark ? 'light' : 'dark'
    
    // 如果浏览器不支持 View Transitions API，或者没有传入事件，则直接切换
    if (!document.startViewTransition || !event) {
      currentTheme.value = nextTheme
      applyTheme(nextTheme)
      return
    }

    // 获取点击位置
    const x = event.clientX
    const y = event.clientY

    // 计算从点击处到屏幕最远角的距离作为圆的半径
    const endRadius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y)
    )

    const transition = document.startViewTransition(() => {
      currentTheme.value = nextTheme
      applyTheme(nextTheme)
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`
      ]

      // 无论是浅色到深色还是深色到浅色，都让新主题从点击处向外扩散
      document.documentElement.animate(
        {
          clipPath
        },
        {
          duration: 400,
          easing: 'ease-out',
          pseudoElement: '::view-transition-new(root)'
        }
      )
    })
  }

  return {
    currentTheme,
    toggleTheme
  }
}
