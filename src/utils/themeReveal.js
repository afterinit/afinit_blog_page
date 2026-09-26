import { createThemeSnapshot } from './themeSnapshot.js'

const DURATION = 400
const HANDOFF_DURATION = 64

function waitForRealPagePaint() {
  return new Promise(resolve => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      resolve()
    }
    const fallback = setTimeout(done, 80)
    requestAnimationFrame(() => requestAnimationFrame(done))
  })
}

function fadeSnapshot(element) {
  return new Promise(resolve => {
    let frame = 0
    let settled = false
    const startedAt = performance.now()
    const done = () => {
      if (settled) return
      settled = true
      cancelAnimationFrame(frame)
      clearTimeout(fallback)
      element.style.opacity = '0'
      resolve()
    }
    const draw = now => {
      const progress = Math.min(1, (now - startedAt) / HANDOFF_DURATION)
      element.style.opacity = `${1 - progress}`
      if (progress < 1) frame = requestAnimationFrame(draw)
      else done()
    }
    const fallback = setTimeout(done, HANDOFF_DURATION + 50)
    frame = requestAnimationFrame(draw)
  })
}

function animateReveal(disc, content, startScale) {
  let frame = 0
  let settle
  let cancelled = false
  const finished = new Promise(resolve => { settle = resolve })
  const startedAt = performance.now()

  const draw = now => {
    if (cancelled) return
    const progress = Math.min(1, (now - startedAt) / DURATION)
    // 与桌面的 ease-out 接近；每帧只更新合成层 transform，不触发裁剪重绘。
    const eased = 1 - Math.pow(1 - progress, 3)
    const scale = startScale + (1 - startScale) * eased
    disc.style.transform = `scale(${scale})`
    content.style.transform = `scale(${1 / scale})`

    if (progress < 1) {
      frame = requestAnimationFrame(draw)
    } else {
      settle()
    }
  }

  frame = requestAnimationFrame(draw)
  return {
    finished,
    cancel() {
      if (cancelled) return
      cancelled = true
      cancelAnimationFrame(frame)
      settle()
    }
  }
}

/** 新主题镜像放在圆形容器中，通过一正一反两个 scale 保持内容尺寸不变。 */
export async function revealThemeWithSnapshot(origin, showNextTheme, restorePreviousTheme) {
  let snapshot, disc, animation, stop, preparationFrame
  let nextThemeIsLive = false
  const viewport = window.visualViewport
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  try {
    // 新主题只存在于镜像里，真实页面在动画期间仍保持旧主题。
    await showNextTheme()
    nextThemeIsLive = true
    snapshot = createThemeSnapshot()

    const content = snapshot.element
    const rect = content.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const x = Math.max(0, Math.min(width, origin.x - rect.left))
    const y = Math.max(0, Math.min(height, origin.y - rect.top))
    const radius = Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y))) + 2
    const startScale = Math.max(0.0025, 1 / radius)
    const savedScrollLeft = content.scrollLeft
    const savedScrollTop = content.scrollTop

    disc = document.createElement('div')
    disc.className = 'theme-transition-disc'
    disc.setAttribute('aria-hidden', 'true')
    Object.assign(disc.style, {
      position: 'fixed',
      left: `${x - radius}px`,
      top: `${y - radius}px`,
      width: `${radius * 2}px`,
      height: `${radius * 2}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transformOrigin: '50% 50%',
      transform: `scale(${startScale})`,
      willChange: 'transform'
    })
    disc.style.setProperty('border-radius', '50%', 'important')

    // 当圆形 scale 为 1 时，镜像的 (0,0) 正好落在真实视口的 (0,0)。
    Object.assign(content.style, {
      position: 'absolute',
      inset: 'auto',
      left: `${radius - x}px`,
      top: `${radius - y}px`,
      width: `${width}px`,
      height: `${height}px`,
      transformOrigin: `${x}px ${y}px`,
      transform: `scale(${1 / startScale})`,
      willChange: 'transform'
    })

    content.parentNode.insertBefore(disc, content)
    disc.appendChild(content)
    content.scrollLeft = savedScrollLeft
    content.scrollTop = savedScrollTop

    await restorePreviousTheme()
    nextThemeIsLive = false

    const initialScrollX = window.scrollX
    const initialScrollY = window.scrollY
    const initialWidth = window.innerWidth
    const initialHeight = window.innerHeight
    const initialScale = viewport?.scale ?? 1
    let finishEarly
    let wasInterrupted = false
    const interrupted = new Promise(resolve => { finishEarly = resolve })
    stop = () => {
      if (
        document.hidden || reducedMotion.matches ||
        Math.abs(window.scrollX - initialScrollX) > 1 ||
        Math.abs(window.scrollY - initialScrollY) > 1 ||
        Math.abs(window.innerWidth - initialWidth) > 2 ||
        Math.abs(window.innerHeight - initialHeight) > 160 ||
        Math.abs((viewport?.scale ?? 1) - initialScale) > 0.01
      ) {
        wasInterrupted = true
        finishEarly()
      }
    }
    window.addEventListener('resize', stop)
    window.addEventListener('scroll', stop)
    viewport?.addEventListener('resize', stop)
    viewport?.addEventListener('scroll', stop)
    document.addEventListener('visibilitychange', stop)
    reducedMotion.addEventListener?.('change', stop)

    // 先提交镜像的初始图层，再开始完整的 400ms 动画。
    const prepared = new Promise(resolve => {
      preparationFrame = requestAnimationFrame(() => {
        preparationFrame = requestAnimationFrame(resolve)
      })
    })
    await Promise.race([prepared, interrupted])
    if (!wasInterrupted) {
      animation = animateReveal(disc, content, startScale)
      await Promise.race([animation.finished, interrupted])
    }
  } finally {
    cancelAnimationFrame(preparationFrame)
    window.removeEventListener('resize', stop)
    window.removeEventListener('scroll', stop)
    viewport?.removeEventListener('resize', stop)
    viewport?.removeEventListener('scroll', stop)
    document.removeEventListener('visibilitychange', stop)
    reducedMotion.removeEventListener?.('change', stop)

    // 停住临时图层，等真实页面至少完成一次绘制后再做极短的透明度交接。
    animation?.cancel()
    try {
      if (!nextThemeIsLive) await showNextTheme()
      if (snapshot?.element && !document.hidden && !reducedMotion.matches) {
        await waitForRealPagePaint()
        await fadeSnapshot(snapshot.element)
      }
    } finally {
      snapshot?.remove()
      disc?.remove()
    }
  }
}
