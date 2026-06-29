import { marked } from 'marked'
import hljs from 'highlight.js'

// 配置 marked 使用 highlight.js 渲染代码块
const renderer = new marked.Renderer()
renderer.code = function({ text, lang }) {
  const language = lang && hljs.getLanguage(lang) ? lang : null
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value
  const displayLang = lang || 'text'
  return `<pre data-lang="${displayLang}"><button class="copy-code-btn" data-code="${encodeURIComponent(text)}" title="复制代码"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><code class="hljs language-${displayLang}">${highlighted}</code></pre>`
}

renderer.image = function({ href, title, text }) {
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(href)) {
    const titleAttr = title ? ` title="${title}"` : ''
    return `<video src="${href}" controls referrerpolicy="no-referrer"${titleAttr}></video>`
  }
  return false
}

// marked v5+ 废弃了 setOptions，改用 use()
// GFM 模式（默认开启）已内置裸 URL 自动链接，无需自定义 autolink 扩展
marked.use({ renderer })

export function processHtml(htmlRaw) {
  // 给所有 a 标签添加新标签页打开属性
  let processed = htmlRaw.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
  
  // 给用户手动编写的 video 标签补充 controls 和 referrerpolicy
  processed = processed.replace(/<video([^>]*)>/gi, (match, p1) => {
    let newAttrs = p1
    if (!/\bcontrols\b/i.test(newAttrs)) {
      newAttrs += ' controls'
    }
    if (!/\breferrerpolicy\b/i.test(newAttrs)) {
      newAttrs += ' referrerpolicy="no-referrer"'
    }
    return `<video${newAttrs}>`
  })
  
  return processed
}

export function parseMdToJson(rawContent) {
  let content = rawContent ? rawContent.trim() : ''

  // 兼容剔除可能存在的 Frontmatter
  const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(fmRegex)
  if (match) {
    content = match[2].trim()
  }

  const lines = content.split('\n')

  let title = ''
  let summary = ''

  // 提取标题并将其从正文中删除
  const titleIdx = lines.findIndex(line => line.trim().startsWith('# '))
  if (titleIdx !== -1) {
    title = lines[titleIdx].replace(/^#\s+/, '').trim()
    lines.splice(titleIdx, 1)
  }

  // 提取摘要并将其从正文中删除（仅当首个非空内容以 > 开头时认为有摘要）
  const firstNonEmptyIdx = lines.findIndex(line => line.trim() !== '')
  if (firstNonEmptyIdx !== -1 && lines[firstNonEmptyIdx].trim().startsWith('>')) {
    while (firstNonEmptyIdx < lines.length) {
      const line = lines[firstNonEmptyIdx]
      if (line.trim() === '') {
        break; // 遇到空行停止提取摘要
      }
      const lineText = line.trim().replace(/^>\s*/, '')
      summary += (summary ? '\n' : '') + lineText
      lines.splice(firstNonEmptyIdx, 1)
    }
  }

  return {
    title: title || '未命名标题',
    summary: summary || '',
    content: lines.join('\n').trim()
  }
}

export { marked }
