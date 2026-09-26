const NON_VISUAL_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'])
const EMBEDDED_TAGS = new Set(['IFRAME', 'OBJECT', 'EMBED', 'AUDIO'])
const KEYFRAME_METADATA = new Set(['offset', 'computedOffset', 'easing', 'composite'])

function copyThemeStyles(overlay) {
  for (const source of [document.documentElement, document.body]) {
    const style = getComputedStyle(source)
    for (const property of style) {
      if (property.startsWith('--')) {
        overlay.style.setProperty(property, style.getPropertyValue(property))
      }
    }
  }

  const bodyStyle = getComputedStyle(document.body)
  for (const property of ['font', 'color', 'line-height', 'letter-spacing', 'text-align', 'direction']) {
    overlay.style.setProperty(property, bodyStyle.getPropertyValue(property))
  }
  overlay.style.backgroundColor = bodyStyle.backgroundColor
}

function copyFormState(source, clone) {
  if (source instanceof HTMLInputElement) {
    if (source.type !== 'file') clone.value = source.value
    clone.checked = source.checked
    clone.indeterminate = source.indeterminate
  } else if (source instanceof HTMLTextAreaElement) {
    clone.value = source.value
  } else if (source instanceof HTMLSelectElement) {
    Array.from(source.options).forEach((option, index) => {
      clone.options[index].selected = option.selected
    })
  }
}

// Replacement media must keep styles that originally depended on its tag name.
function copyMediaStyles(source, replacement) {
  const style = getComputedStyle(source)
  for (const property of style) {
    replacement.style.setProperty(property, style.getPropertyValue(property))
  }
  replacement.style.setProperty('animation', 'none', 'important')
  replacement.style.setProperty('transition', 'none', 'important')
}

function copyMedia(source, canvases) {
  const isCanvas = source instanceof HTMLCanvasElement
  const isVideo = source instanceof HTMLVideoElement
  if (!isCanvas && !isVideo && !EMBEDDED_TAGS.has(source.tagName)) return null

  const replacement = document.createElement(isCanvas || isVideo ? 'canvas' : 'div')
  for (const attribute of source.attributes) {
    // Keep ids and scoped style attributes, but never recreate media requests.
    if (
      !attribute.name.toLowerCase().startsWith('on') &&
      !['src', 'srcset', 'poster', 'data', 'autoplay', 'autofocus'].includes(attribute.name)
    ) {
      replacement.setAttribute(attribute.name, attribute.value)
    }
  }
  copyMediaStyles(source, replacement)

  if (isCanvas || isVideo) {
    replacement.width = isCanvas ? source.width : (source.videoWidth || source.clientWidth)
    replacement.height = isCanvas ? source.height : (source.videoHeight || source.clientHeight)
    canvases.push(replacement)
    try {
      if (isCanvas || source.readyState >= 2) {
        replacement.getContext('2d')?.drawImage(source, 0, 0, replacement.width, replacement.height)
      }
    } catch {
      // An unavailable/protected frame leaves a static placeholder for 400 ms.
      // Never serialize pixels: drawing a cross-origin image may taint the canvas.
    }
  }

  return replacement
}

function copyNode(source, clones, scrollPositions, canvases) {
  if (source.nodeType !== Node.ELEMENT_NODE) return source.cloneNode(false)
  if (NON_VISUAL_TAGS.has(source.tagName) || source.tagName === 'SOURCE') return null

  // Never create a second video/iframe: even detached media may start loading.
  const media = copyMedia(source, canvases)
  const clone = media || source.cloneNode(false)
  for (const attribute of Array.from(clone.attributes)) {
    if (attribute.name.toLowerCase().startsWith('on')) clone.removeAttribute(attribute.name)
  }
  clone.removeAttribute('autofocus')

  if (!media) {
    for (const child of source.childNodes) {
      const copy = copyNode(child, clones, scrollPositions, canvases)
      if (copy) clone.appendChild(copy)
    }
    copyFormState(source, clone)
  }

  if (source instanceof HTMLImageElement) {
    if (source.complete && source.naturalWidth > 0 && source.currentSrc) {
      clone.loading = 'eager'
      clone.decoding = 'sync'
      clone.removeAttribute('srcset')
      clone.removeAttribute('sizes')
      clone.src = source.currentSrc
    } else {
      // 未加载的图片只保留占位，不能为一次主题动画启动整篇文章的懒加载。
      clone.removeAttribute('src')
      clone.removeAttribute('srcset')
      clone.removeAttribute('sizes')
      const style = getComputedStyle(source)
      clone.style.width = style.width
      clone.style.height = style.height
    }
    if (source.width && source.height) {
      clone.width = source.width
      clone.height = source.height
    }
  }

  clones.set(source, clone)
  if (source.scrollTop || source.scrollLeft) {
    scrollPositions.push([clone, source.scrollLeft, source.scrollTop])
  }
  return clone
}

function freezeAnimations(source, clones) {
  if (typeof source.getAnimations !== 'function') return
  for (const animation of source.getAnimations({ subtree: true })) {
    const effect = animation.effect
    const clone = clones.get(effect?.target)
    if (!clone || effect.pseudoElement || typeof effect.getKeyframes !== 'function') continue

    const style = getComputedStyle(effect.target)
    for (const keyframe of effect.getKeyframes()) {
      for (const property of Object.keys(keyframe)) {
        if (KEYFRAME_METADATA.has(property)) continue
        const cssProperty = property.startsWith('--')
          ? property
          : property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
        clone.style.setProperty(cssProperty, style.getPropertyValue(cssProperty), 'important')
      }
    }
  }
}

/** A short-lived, noninteractive copy of the old theme; the live page stays intact. */
export function createThemeSnapshot() {
  const app = document.getElementById('app')
  if (!app) throw new Error('Cannot capture theme without #app')

  const overlay = document.createElement('div')
  overlay.className = 'theme-transition-overlay'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.setAttribute('inert', '')
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '2147483647'
  })
  copyThemeStyles(overlay)

  const clones = new Map()
  const scrollPositions = []
  const canvases = []
  // Include body-level Vue/Element Plus teleports as well as the app itself.
  const sources = Array.from(document.body.children).filter(source => (
    !NON_VISUAL_TAGS.has(source.tagName) &&
    !source.classList.contains('theme-transition-overlay') &&
    !source.classList.contains('theme-transition-shield')
  ))

  for (const sourceRoot of sources) {
    const cloneRoot = copyNode(sourceRoot, clones, scrollPositions, canvases)
    if (cloneRoot) overlay.appendChild(cloneRoot)
    freezeAnimations(sourceRoot, clones)
  }

  // Keep input blocking outside the clipped layer so the growing hole is inert too.
  const shield = document.createElement('div')
  shield.className = 'theme-transition-shield'
  shield.setAttribute('aria-hidden', 'true')
  Object.assign(shield.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    pointerEvents: 'auto',
    touchAction: 'none',
    background: 'transparent'
  })
  const blockInput = event => {
    if (event.cancelable) event.preventDefault()
    event.stopImmediatePropagation()
  }
  const blockedEvents = ['wheel', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'click']
  for (const type of blockedEvents) {
    shield.addEventListener(type, blockInput, { capture: true, passive: false })
  }

  document.body.append(overlay, shield)
  for (const [clone, left, top] of scrollPositions) {
    clone.scrollLeft = left
    clone.scrollTop = top
  }
  // A mirror scroll container preserves sticky and viewport-fixed positioning.
  // Do not translate the clone or establish a new fixed-position containing block.
  overlay.scrollLeft = window.scrollX
  overlay.scrollTop = window.scrollY

  return {
    element: overlay,
    remove() {
      overlay.remove()
      shield.remove()
      for (const type of blockedEvents) shield.removeEventListener(type, blockInput, true)
      for (const canvas of canvases) {
        canvas.width = 0
        canvas.height = 0
      }
      clones.clear()
      scrollPositions.length = 0
      canvases.length = 0
    }
  }
}
