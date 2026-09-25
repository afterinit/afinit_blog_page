<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked, parseMdToJson, processHtml } from '../utils/mdParser.js'
import { AuthError } from '../utils/request.js'
import { refreshHomePosts } from '../composables/useHomeRefresh.js'
import { useDialog } from '../composables/useDialog.js'
import { useUserInfo } from '../composables/useUserInfo.js'
import { formatLocalTime } from '../utils/timeFormat.js'
import { useTheme } from '../composables/useTheme.js'
import ThemeToggle from '../components/ThemeToggle.vue'
import { blogApi } from '../api/blog.js'
import { barrageApi } from '../api/barrage.js'
const route = useRoute()
const router = useRouter()
const { userInfo } = useUserInfo()
const { currentTheme, toggleTheme } = useTheme()

const articleData = ref(null)
const loading = ref(false)
const error = ref('')
const articleReady = ref(false)

const isEditing = ref(false)
const outline = ref([])
// 默认不打开侧边栏
const isMobile = () => window.innerWidth < 768
const showOutline = ref(false)

const zoomedImage = ref('')
const zoomScale = ref(1)
const zoomTranslateX = ref(0)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)

// 控制屏幕弹幕的开启与关闭
const barrageEnabled = ref(true)
const toggleBarrage = () => {
  barrageEnabled.value = !barrageEnabled.value
}

const handleArticleClick = (e) => {
  if (e.target.tagName === 'IMG') {
    zoomedImage.value = e.target.src
    zoomScale.value = 1
    zoomTranslateX.value = 0
    zoomTranslateY.value = 0
  } else if (e.target.closest && e.target.closest('.copy-code-btn')) {
    const btn = e.target.closest('.copy-code-btn')
    const text = decodeURIComponent(btn.dataset.code)
    navigator.clipboard.writeText(text).then(() => {
      const originalHTML = btn.innerHTML
      btn.innerHTML = '<span style="font-size:12px;font-weight:600;">已复制!</span>'
      setTimeout(() => { btn.innerHTML = originalHTML }, 2000)
    })
  }
}

const closeZoom = () => {
  zoomedImage.value = ''
}

const handleZoomWheel = (e) => {
  if (!zoomedImage.value) return
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  let newScale = zoomScale.value + delta
  if (newScale < 0.2) newScale = 0.2
  if (newScale > 10) newScale = 10
  zoomScale.value = newScale
}

const handleZoomMouseDown = (e) => {
  if (e.button !== 0) return // left click only
  isDragging.value = true
  dragStartX.value = e.clientX - zoomTranslateX.value
  dragStartY.value = e.clientY - zoomTranslateY.value
}

const handleZoomMouseMove = (e) => {
  if (!isDragging.value) return
  zoomTranslateX.value = e.clientX - dragStartX.value
  zoomTranslateY.value = e.clientY - dragStartY.value
}

const handleZoomMouseUp = () => {
  isDragging.value = false
}

const extractOutline = (html) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const headers = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const list = []
  headers.forEach((el, index) => {
    const id = el.id || `heading-${index}`
    el.id = id
    const level = parseInt(el.tagName.replace('H', ''))
    list.push({
      id: id,
      text: el.textContent,
      level: level
    })
  })
  
  return { updatedHtml: doc.body.innerHTML, list }
}

const scrollToHeading = (id) => {
  const el = document.getElementById(id)
  if (el) {
    const offset = 80;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }
  // 移动端点击条目后自动关闭抽屉
  if (isMobile()) {
    showOutline.value = false
  }
}

const editMdText = ref('')
const fileInput = ref(null)

const showDeleteModal = ref(false)
const {
  dialog: customAlert,
  showDialog: showAlert,
  confirmDialog: handleAlertConfirm,
} = useDialog()

const fetchArticle = async () => {
  loading.value = true
  error.value = ''
  try {
    const id = route.params.id
    const isPrivate = route.query.type === 'private'
    const res = await blogApi.getBlogDetail(id, isPrivate)

    const data = res.data ? res.data : res

    let dateStr = data.createTime ? formatLocalTime(data.createTime) : ''
    let htmlRaw = marked.parse(data.content || '');
    if (typeof htmlRaw !== 'string') {
        htmlRaw = String(htmlRaw);
    }
    const htmlSafe = processHtml(htmlRaw);

    const { updatedHtml, list } = extractOutline(htmlSafe)
    outline.value = list

    articleData.value = {
      title: data.title || '未命名标题',
      nickname: data.nickname || '',
      userId: data.userId || '',
      summary: data.summary || '',
      summaryHtml: data.summary ? processHtml(marked.parseInline(data.summary)).replace(/\n/g, '<br>') : '',
      date: dateStr,
      viewCount: data.viewCount || 0,
      likeCount: data.likeCount || 0,
      htmlContent: updatedHtml,
      rawContent: data.content || ''
    }

  } catch (err) {
    if (err.isAuthError) return
    error.value = '文章加载失败: ' + err.message
    console.error(err)
  } finally {
    loading.value = false
    // 等待 Vue 渲染完文章内容后，重新计算滚动布局，防止弹幕堆叠
    nextTick(() => {
      // 稍微延迟以确保页面布局基本完成
      setTimeout(() => {
        updateScrollInfo()
        articleReady.value = true
      }, 100)
    })
  }
}

const downloadMd = () => {
  if (!articleData.value) return;
  
  let md = '';
  if (articleData.value.title) md += `# ${articleData.value.title}\n\n`;
  if (articleData.value.summary) {
    const summaryLines = articleData.value.summary.split('\n').map(line => `> ${line}`).join('\n');
    md += `${summaryLines}\n\n`;
  }
  md += articleData.value.rawContent;

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${articleData.value.title || 'article'}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const startEdit = () => {
  let md = '';
  if (articleData.value.title) md += `# ${articleData.value.title}\n\n`;
  if (articleData.value.summary) {
    const summaryLines = articleData.value.summary.split('\n').map(line => `> ${line}`).join('\n');
    md += `${summaryLines}\n\n`;
  }
  md += articleData.value.rawContent;
  
  editMdText.value = md;
  isEditing.value = true;
}

const submitEdit = async () => {
  try {
    const parsedData = parseMdToJson(editMdText.value);
    const res = await blogApi.updateBlog(
      route.params.id,
      parsedData.title,
      parsedData.summary,
      parsedData.content
    )
    refreshHomePosts()
    showAlert(res.msg || res.message || '修改成功！', () => {
      isEditing.value = false
      fetchArticle() 
    })
  } catch(e) {
    if (e.isAuthError) return
    showAlert(e.message)
  }
}

const confirmDelete = async () => {
  try {
    const res = await blogApi.deleteBlog(route.params.id)
    refreshHomePosts()
    showAlert(res.msg || res.message || '删除成功！', () => {
      showDeleteModal.value = false
      router.replace('/')
    })
  } catch(e) {
    if (e.isAuthError) return
    showAlert(e.message)
    showDeleteModal.value = false
  }
}

function handleDrop(e) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file) readFile(file)
}

function handleFileSelect(e) {
  const file = e.target.files[0]
  if (file) readFile(file)
  e.target.value = ''
}

function readFile(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    editMdText.value = e.target.result
  }
  reader.readAsText(file)
}

// ===== 弹幕系统 =====

// 获取当前滚动百分比 (0 到 100)
const getScrollPercent = () => {
  const scrollTop = window.scrollY || document.documentElement.scrollTop
  const scrollHeight = document.documentElement.scrollHeight
  const clientHeight = document.documentElement.clientHeight
  if (scrollHeight <= clientHeight) return 0
  return (scrollTop / (scrollHeight - clientHeight)) * 100
}

// 弹幕输入框状态
const barrageInput = ref('')
const barrageSending = ref(false)
const barrageError = ref('')
const barrageInputActive = ref(false) // 输入框是否被激活

// 悬浮提示 (Toast) 状态
const toastMsg = ref('')
const toastIsError = ref(false)
let toastTimer = null
const showToast = (msg, isError = false) => {
  toastMsg.value = msg
  toastIsError.value = isError
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 3000)
}

// 预存储的弹幕：{ content, scrollPercent }
const storedBarrages = ref([])

// 当前滚动状态
const currentScrollPercent = ref(0)
const currentScrollTop = ref(0)
const maxScrollTop = ref(0)

// 弹幕轨道数
const TRACK_COUNT = 3

const updateScrollInfo = () => {
  currentScrollTop.value = window.scrollY || document.documentElement.scrollTop
  const scrollHeight = document.documentElement.scrollHeight
  const clientHeight = document.documentElement.clientHeight
  maxScrollTop.value = Math.max(0, scrollHeight - clientHeight)
  currentScrollPercent.value = maxScrollTop.value > 0 ? (currentScrollTop.value / maxScrollTop.value) * 100 : 0
}

// 防重叠布局计算（在maxScrollTop变化或弹幕增加时重新排版）
const layoutBarrages = computed(() => {
  // 按照 scrollPercent 排序，确保从前到后排版
  const sorted = [...storedBarrages.value].sort((a, b) => Number(a.scrollPercent) - Number(b.scrollPercent))
  
  // 记录每个轨道最后一条弹幕的“最右侧”占位（单位：虚拟像素）
  const tracksEnd = new Array(TRACK_COUNT).fill(-99999)
  const speedMultiplier = 1.2
  // 将屏幕像素转换成虚拟像素：30px 间距在虚拟轴上是 30 / speedMultiplier
  const virtualGap = 30 / speedMultiplier
  // 视口一半宽度的虚拟像素（保证极端位置的弹幕也有足够的距离飞入飞出）
  const halfScreenVirtual = (window.innerWidth > 0 ? window.innerWidth / 2 : 500) / speedMultiplier
  
  // 为了让弹幕在滚动到对应位置时刚好处于屏幕中央，将排版起止设为 0 和 maxScrollTop
  // 这样当 currentScrollTop == P * maxScrollTop 时，偏差 pixelDiff 恰好为 0（即居中）
  // 极短文章(maxScrollTop=0)时，所有弹幕的 basePixelX 都为 0，从中央开始防重叠排版
  const startVirtualX = 0;
  const layoutWidth = Math.max(0, maxScrollTop.value);
  
  return sorted.map(b => {
    // 弹幕的原始虚拟锚点：按百分比映射到起止范围内
    const mappedPercent = Number(b.scrollPercent) / 100
    const basePixelX = startVirtualX + mappedPercent * layoutWidth
    // 预估弹幕宽度（屏幕像素）：14px/字 + 40px 的左右内边距
    const estimatedScreenWidth = b.content.length * 14 + 40
    const estimatedVirtualWidth = estimatedScreenWidth / speedMultiplier
    
    let assignedTrack = 0
    let finalPixelX = basePixelX
    
    // 尝试找一个不会重叠的轨道
    let foundTrack = false
    for (let i = 0; i < TRACK_COUNT; i++) {
      if (basePixelX >= tracksEnd[i] + virtualGap) {
        assignedTrack = i
        foundTrack = true
        break
      }
    }
    
    // 如果所有轨道都满了（即该位置弹幕太密集），强制将其往后推，排在最早结束的轨道后面
    if (!foundTrack) {
      let minEnd = Infinity
      let bestTrack = 0
      for (let i = 0; i < TRACK_COUNT; i++) {
        if (tracksEnd[i] < minEnd) {
          minEnd = tracksEnd[i]
          bestTrack = i
        }
      }
      assignedTrack = bestTrack
      finalPixelX = minEnd + virtualGap
    }
    
    // 更新该轨道的占用边界
    tracksEnd[assignedTrack] = finalPixelX + estimatedVirtualWidth
    
    return {
      ...b,
      _basePixelX: finalPixelX + (b._randX || 0),
      _track: assignedTrack,
      _offsetY: b._randY || 0
    }
  })
})

// 基于百分比差值的响应式弹幕列表
const visibleBarrages = computed(() => {
  if (layoutBarrages.value.length === 0) return []
  
  const halfScreen = window.innerWidth > 0 ? window.innerWidth : 1000
  const speedMultiplier = 1.2 // 滚动1px，弹幕移动1.2px
  
  return layoutBarrages.value.map(b => {
    // 计算当前滚动位置与该弹幕布局锚点的偏差
    const pixelDiff = b._basePixelX - currentScrollTop.value
    return {
      ...b,
      _pixelDiff: pixelDiff
    }
  }).filter(b => Math.abs(b._pixelDiff * speedMultiplier) < halfScreen + 300)
})

// 面板拖动 & 显隐
const panelVisible = ref(true)
const panelX = ref(null)
const panelY = ref(null)
let _panelDragOffsetX = 0
let _panelDragOffsetY = 0
let _isDraggingPanel = false
let _didDrag = false

let _panelWidth = 150
let _panelHeight = 40

const startDragPanel = (e) => {
  if (e.target.closest('.barrage-close-btn')) return
  
  const panelEl = e.currentTarget
  const rect = panelEl.getBoundingClientRect()
  _panelWidth = rect.width
  _panelHeight = rect.height
  
  _isDraggingPanel = true
  _didDrag = false
  
  const cx = e.touches ? e.touches[0].clientX : e.clientX
  const cy = e.touches ? e.touches[0].clientY : e.clientY
  
  // 若还未拖动过，初始化坐标为当前真实渲染坐标
  if (panelX.value === null) panelX.value = rect.left
  if (panelY.value === null) panelY.value = rect.top
  
  _panelDragOffsetX = cx - panelX.value
  _panelDragOffsetY = cy - panelY.value
  
  window.addEventListener('mousemove', onDragPanel)
  window.addEventListener('mouseup', endDragPanel)
  window.addEventListener('touchmove', onDragPanel, { passive: false })
  window.addEventListener('touchend', endDragPanel)
}

const onDragPanel = (e) => {
  if (!_isDraggingPanel) return
  if (e.cancelable) e.preventDefault()
  _didDrag = true
  const cx = e.touches ? e.touches[0].clientX : e.clientX
  const cy = e.touches ? e.touches[0].clientY : e.clientY
  
  // 拖动范围限制在屏幕内，根据当前面板实际宽高计算
  panelX.value = Math.max(0, Math.min(window.innerWidth - _panelWidth, cx - _panelDragOffsetX))
  panelY.value = Math.max(0, Math.min(window.innerHeight - _panelHeight, cy - _panelDragOffsetY))
}

const endDragPanel = () => {
  _isDraggingPanel = false
  window.removeEventListener('mousemove', onDragPanel)
  window.removeEventListener('mouseup', endDragPanel)
  window.removeEventListener('touchmove', onDragPanel)
  window.removeEventListener('touchend', endDragPanel)
}

const hidePanel = () => { panelVisible.value = false }
const showPanel = () => { panelVisible.value = true }

const onInputBlur = (e) => {
  // 如果点的是发送按钮，不收起
  if (e && e.relatedTarget && e.relatedTarget.classList.contains('barrage-panel-send')) return
  barrageInputActive.value = false
  barrageError.value = '' // 失焦时隐藏错误信息
}

// 发送弹幕
const sendBarrage = async () => {
  if (!barrageInput.value.trim()) return
  if (barrageSending.value) return
  barrageError.value = ''
  barrageSending.value = true
  try {
    const scrollPercent = parseFloat(getScrollPercent().toFixed(2))
    const blogId = Number(route.params.id)
    const res = await barrageApi.sendBarrage(blogId, barrageInput.value.trim(), '#FFFFFF', scrollPercent)
    if (res.success) {
      storedBarrages.value.push({
        id: 'new-' + Date.now(),
        content: barrageInput.value.trim(),
        scrollPercent,
        userId: userInfo.value?.id,
        _randY: Math.floor(Math.random() * 20 - 10),
        _randX: Math.floor(Math.random() * 60 - 30)
      })
      barrageInput.value = ''
      showToast('弹幕已发出！')
      barrageInputActive.value = false
    } else {
      barrageError.value = res.msg || res.message || '发送弹幕失败，请稍后再试'
      setTimeout(() => { barrageError.value = '' }, 3000)
    }
  } catch (e) {
    if (e.isAuthError) {
      barrageError.value = '请先登录后再发送弹幕'
      return
    }
    barrageError.value = '网络异常，请稍后再试'
    setTimeout(() => { barrageError.value = '' }, 3000)
  } finally {
    barrageSending.value = false
  }
}

// 监听滚动
const handleScroll = () => {
  updateScrollInfo()
}

// 加载历史弹幕
const loadBarrages = async () => {
  try {
    const blogId = Number(route.params.id)
    const res = await barrageApi.getBarrages(blogId)
    if (Array.isArray(res.data)) {
      storedBarrages.value = res.data.map((b, i) => ({
        ...b,
        id: String(b.id ?? `hist-${i}`),
        scrollPercent: Number(b.scrollPercent),
        _randY: Math.floor(Math.random() * 20 - 10),
        _randX: Math.floor(Math.random() * 60 - 30)
      }))
      await nextTick()
      updateScrollInfo()
    }
  } catch {
    // 静默忽略
  }
}

const handleGlobalClick = (e) => {
  if (barrageInputActive.value && e.target && !e.target.closest('.barrage-panel') && !e.target.closest('.barrage-peek')) {
    barrageInputActive.value = false
    barrageError.value = ''
  }
}

// 删除弹幕
const deleteBarrage = async (id) => {
  try {
    if (String(id).startsWith('new-')) {
      storedBarrages.value = storedBarrages.value.filter(b => String(b.id) !== String(id))
      showToast('删除弹幕成功')
      return
    }
    const res = await barrageApi.deleteBarrage(id)
    if (res.success) {
      storedBarrages.value = storedBarrages.value.filter(b => String(b.id) !== String(id))
      showToast(res.msg || '删除弹幕成功')
    } else {
      showToast(res.msg || res.message || '删除弹幕失败', true)
    }
  } catch (e) {
    if (e.isAuthError) {
      showToast('请先登录', true)
      return
    }
    showToast('删除失败', true)
  }
}

onMounted(() => {
  fetchArticle()
  loadBarrages()
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('click', handleGlobalClick)
  window.addEventListener('touchstart', handleGlobalClick, { passive: true })
  updateScrollInfo()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('touchstart', handleGlobalClick)
})
</script>

<template>
  <div class="page-wrapper">

    <!-- 弹幕飞行层：完全响应式跟随滚动百分比 -->
    <div class="barrage-layer" aria-hidden="true" v-show="barrageEnabled && articleReady">
      <div
        v-for="b in visibleBarrages"
        :key="b.id"
        class="barrage-item"
        :class="{ 'barrage-item--self': userInfo && String(userInfo.id) === String(b.userId) }"
        :style="{
          top: `${b._track * 45 + 10 + (b._offsetY || 0)}px`,
          left: `50%`,
          transform: `translateX(calc(-50% + ${b._pixelDiff * 1.2}px))`
        }"
      >
        <span>{{ b.content }}</span>
        <button 
          v-if="userInfo && (String(userInfo.id) === String(b.userId) || userInfo.role === 1)"
          class="barrage-delete-btn" 
          @click.stop="deleteBarrage(b.id)" 
          title="删除弹幕"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <!-- 弹幕发送面板（右下角，可拖动，点击唤醒放大） -->
    <transition name="panel-pop">
      <div
        v-if="panelVisible && articleReady"
        class="barrage-panel"
        :class="{ 'barrage-panel--active': barrageInputActive }"
        :style="panelX !== null ? { left: panelX + 'px', top: panelY + 'px', right: 'auto', bottom: 'auto' } : {}"
        @mousedown="startDragPanel"
        @touchstart.passive="startDragPanel"
      >
        <button class="barrage-close-btn" @click.stop="hidePanel" title="隐藏">×</button>
        <div class="barrage-panel-body">
          <button class="barrage-toggle-btn" @click.stop="toggleBarrage" :title="barrageEnabled ? '关闭弹幕' : '开启弹幕'">
            <!-- 开眼图标 -->
            <svg v-if="barrageEnabled" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <!-- 闭眼图标 -->
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          </button>
          <input
            class="barrage-panel-input"
            v-model="barrageInput"
            placeholder="发个弹幕..."
            maxlength="20"
            @focus="barrageInputActive = true"
            @blur="onInputBlur"
            @keydown.enter="sendBarrage"
            @mousedown.stop
          />
          <transition name="send-fade">
            <button
              v-if="barrageInputActive"
              class="barrage-panel-send"
              :disabled="barrageSending || !barrageInput.trim()"
              @click.stop="sendBarrage"
              @mousedown.stop
            >
              <span v-if="!barrageSending">发送</span>
              <span v-else class="btn-spinner"></span>
            </button>
          </transition>
        </div>
        <transition name="fade-msg">
          <p v-if="barrageError" class="barrage-msg barrage-msg--err">{{ barrageError }}</p>
        </transition>
      </div>
    </transition>

    <!-- 顶部悬浮提示 (Toast) -->
    <transition name="toast-slide">
      <div v-if="toastMsg" class="floating-toast" :class="{'toast-error': toastIsError}">
        {{ toastMsg }}
      </div>
    </transition>

    <!-- 隐藏时右侧半圆唤起按钮 -->
    <transition name="peek-slide">
      <button v-if="!panelVisible && articleReady" class="barrage-peek" @click="showPanel" title="发弹幕">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    </transition>

    <!-- 移动端遮罩（点击关闭抽屉） -->
    <div class="outline-mobile-mask" v-if="showOutline" @click="showOutline = false"></div>

    <!-- 大纲侧边栏 / 移动端左侧抽屉 -->
    <div class="outline-sidebar" :class="{ 'outline-open': showOutline }">
      <div class="outline-header">
        <h3>文章大纲</h3>
        <!-- 移动端关闭按钮 -->
        <button class="outline-close-btn" @click="showOutline = false" title="关闭大纲">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="outline-content" v-if="outline.length > 0">
        <a 
          v-for="item in outline" 
          :key="item.id" 
          :href="'#' + item.id"
          class="outline-item"
          :style="{ paddingLeft: (item.level - 1) * 16 + 16 + 'px' }"
          @click.prevent="scrollToHeading(item.id)"
          :title="item.text"
        >
          {{ item.text }}
        </a>
      </div>
      <div v-else class="outline-empty">
        暂无大纲
      </div>
    </div>

    <div class="container">
      <div class="header-nav">
        <div style="display: flex; align-items: center; gap: 16px;">
          <!-- 大纲切换按钮 -->
          <button class="sidebar-toggle-btn" @click="showOutline = !showOutline" title="切换大纲">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
          <button class="back-btn" @click="router.back()">← 返回列表</button>
        </div>
        <div v-if="!loading && !error && !isEditing" class="action-buttons">
          <ThemeToggle />
          <button class="btn btn-outline" @click="downloadMd">下载Markdown文档</button>
          <button v-if="userInfo && articleData && (String(userInfo.id) === String(articleData.userId) || userInfo.role === 1)" class="btn btn-outline" @click="startEdit">修改文章</button>
          <button v-if="userInfo && articleData && (String(userInfo.id) === String(articleData.userId) || userInfo.role === 1)" class="btn btn-outline btn-danger" @click="showDeleteModal = true">删除</button>
        </div>
      </div>

    <!-- 极简编辑模式 (单文本框) -->
    <div v-if="isEditing" class="edit-mode">
      <div class="edit-header">
        <span style="font-size: 14px; color: #666;">在线修改 (支持直接拖拽/上传 Markdown 文件替换)</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-outline" @click="fileInput.click()">上传文件</button>
          <input ref="fileInput" type="file" style="display: none" @change="handleFileSelect" />
        </div>
      </div>
      <textarea 
        class="editor-textarea" 
        v-model="editMdText" 
        placeholder="在此修改 Markdown 文本..."
        @dragover.prevent
        @drop="handleDrop"
      ></textarea>
      <div class="form-actions">
        <button class="btn" @click="submitEdit">保存提交</button>
        <button class="btn btn-outline" @click="isEditing = false">取消</button>
      </div>
    </div>

    <!-- 阅读模式 -->
    <div v-else>
      <div v-if="loading" class="status-msg">正在加载文章...</div>
      <div v-else-if="error" class="status-msg error">{{ error }}</div>
      
      <div v-else-if="articleData" class="article-render">
        <h1 class="article-title">{{ articleData.title }}</h1>
        <p v-if="articleData.summary" class="article-summary typora-style" v-html="articleData.summaryHtml"></p>
        <div class="article-meta">
          <span v-if="articleData.nickname">{{ articleData.nickname }}</span>
          <span v-if="articleData.date">{{ articleData.date }}</span>
          <span>阅读 {{ articleData.viewCount }}</span>
          <span>点赞 {{ articleData.likeCount }}</span>
        </div>
        <div class="typora-style" v-html="articleData.htmlContent" @click="handleArticleClick"></div>
      </div>
    </div>

    <!-- 极简删除确认弹窗 -->
    <div class="modal-overlay" v-if="showDeleteModal">
      <div class="modal-content">
        <h3>确认删除</h3>
        <p>确定要永久删除这篇文章吗？此操作不可恢复。</p>
        <div class="modal-actions">
          <button class="btn btn-danger" style="color: #fff" @click="confirmDelete">确认删除</button>
          <button class="btn btn-outline" @click="showDeleteModal = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 独立提示弹窗 -->
    <div class="modal-overlay" v-if="customAlert.show">
      <div class="modal-content">
        <h3>提示</h3>
        <p>{{ customAlert.message }}</p>
        <div class="modal-actions">
          <button class="btn" @click="handleAlertConfirm">确定</button>
        </div>
      </div>
    </div>

    <!-- 图片放大弹窗 -->
    <div 
      class="image-zoom-overlay" 
      v-if="zoomedImage" 
      @click="closeZoom"
      @wheel.prevent="handleZoomWheel"
      @mousemove="handleZoomMouseMove"
      @mouseup="handleZoomMouseUp"
      @mouseleave="handleZoomMouseUp"
    >
      <img 
        :src="zoomedImage" 
        class="zoomed-image" 
        :style="{ transform: `translate(${zoomTranslateX}px, ${zoomTranslateY}px) scale(${zoomScale})`, cursor: isDragging ? 'grabbing' : 'grab', transition: isDragging ? 'none' : 'transform 0.1s ease-out' }"
        @click.stop
        @mousedown.prevent="handleZoomMouseDown"
      />
      <button class="zoom-close-btn" @click="closeZoom">×</button>
    </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* ===== 整体布局 ===== */
.page-wrapper { 
  display: flex; 
  align-items: flex-start;
  max-width: 1200px;
  margin: 0 auto;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
}

/* ===== 大纲侧边栏（桌面端） ===== */
.outline-sidebar {
  position: sticky;
  top: 0;
  width: 0;
  height: 100vh;
  background: var(--bg-secondary);
  border-right: none;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-sizing: border-box;
  overflow: hidden;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s ease;
  z-index: 50;
}

.outline-sidebar.outline-open {
  width: 300px;
  border-right: 1px solid var(--border-color);
}

.outline-header {
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.outline-header h3 {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--text-secondary);
  font-weight: 600;
}

.outline-close-btn { display: none; }

.outline-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 24px;
}

/* 滚动条美化 */
.outline-content::-webkit-scrollbar { width: 6px; }
.outline-content::-webkit-scrollbar-thumb { background: #333; }
.outline-content::-webkit-scrollbar-thumb:hover { background: #555; }

.outline-item {
  display: block;
  padding: 8px 12px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  line-height: 1.5;
  transition: all 0.25s ease;
  white-space: normal;
  word-break: break-word;
  margin-bottom: 4px;
  position: relative;
}

.outline-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
  transform: translateX(2px);
}

.outline-empty {
  padding: 20px;
  color: var(--text-secondary);
  text-align: center;
  font-size: 14px;
}

.outline-mobile-mask { display: none; }

/* ===== 内容区 ===== */
.container { 
  flex: 1; 
  min-width: 0;
  max-width: 860px; 
  margin: 0 auto; 
  padding: 0 40px 100px; 
}

.header-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  margin-bottom: 40px;
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

.sidebar-toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s, transform 0.2s;
}

.sidebar-toggle-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  transform: scale(1.05);
}

.back-btn { 
  background: transparent; 
  border: none; 
  font-size: 14px; 
  color: var(--text-secondary); 
  font-weight: 500;
  cursor: pointer; 
  padding: 8px 12px; 
  transition: all 0.2s ease;
}
.back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.action-buttons { display: flex; gap: 12px; }

.btn { 
  padding: 8px 16px; 
  background-color: var(--text-primary); 
  color: var(--bg-primary); 
  border: 1px solid var(--text-primary); 
  font-size: 13px; 
  font-weight: 500;
  cursor: pointer; 
  transition: all 0.25s ease; 
}
.btn:hover { background-color: var(--accent-hover); transform: translateY(-1px); }
.btn-sm { padding: 6px 12px; font-size: 12px; }

.btn-outline { 
  background-color: transparent; 
  color: var(--text-primary); 
  border-color: var(--border-color); 
}
.btn-outline:hover { 
  background-color: var(--bg-hover); 
  border-color: var(--text-primary); 
  transform: translateY(-1px);
}

.btn-danger { color: var(--danger-color); border-color: var(--danger-color); }
.btn-danger:hover { background-color: rgba(255, 77, 79, 0.1); border-color: var(--danger-color); color: var(--danger-color); }

/* 弹窗样式 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(6px); }
.modal-content { background: var(--bg-secondary); padding: 40px; width: 340px; border: 1px solid var(--border-color); animation: modal-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes modal-pop { 0% { transform: scale(0.95); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.modal-content h3 { margin: 0 0 12px 0; font-size: 20px; color: var(--text-primary); font-weight: 600; }
.modal-content p { margin: 0 0 32px 0; font-size: 15px; color: var(--text-secondary); line-height: 1.6; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
.modal-actions .btn-danger { background-color: var(--danger-color); color: #fff; border-color: var(--danger-color); }
.modal-actions .btn-danger:hover { background-color: #ff7875; border-color: #ff7875; color: #fff; }

.status-msg { text-align: center; color: var(--text-secondary); margin-top: 120px; font-size: 15px; font-weight: 500; }
.status-msg.error { color: var(--danger-color); }

/* 编辑模式样式 */
.edit-mode { display: flex; flex-direction: column; background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 24px; }
.edit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color);}
.editor-textarea { width: 100%; height: 60vh; padding: 20px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.6; resize: vertical; box-sizing: border-box; outline: none; transition: border-color 0.3s; background: transparent; color: var(--text-primary); }
.editor-textarea:focus { border-color: var(--text-primary); }

.form-actions { display: flex; gap: 12px; margin-top: 24px; }

/* Typora 主题文章样式 - 深色直角版 */
.article-render { animation: fade-in 0.6s ease-out; }
@keyframes fade-in { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }

.article-title { font-size: 40px; font-weight: 800; color: var(--text-primary); margin: 0 0 24px 0; line-height: 1.3; letter-spacing: -0.03em; }

.article-summary { 
  font-size: 16px; 
  color: var(--text-secondary); 
  background: var(--bg-secondary);
  padding: 20px 24px; 
  border-left: 4px solid var(--text-primary); 
  margin: 0 0 24px 0; 
  line-height: 1.6;
}

.article-meta { 
  display: flex; 
  align-items: center;
  flex-wrap: wrap;
  gap: 20px; 
  font-size: 14px; 
  color: var(--text-secondary); 
  margin-bottom: 48px; 
  padding-bottom: 24px; 
  border-bottom: 1px solid var(--border-color); 
  font-weight: 500;
}
.article-meta span { display: flex; align-items: center; gap: 6px; }

/* Typora HTML 渲染细节样式 */
.typora-style { font-size: 17px; line-height: 1.85; color: var(--text-primary); }
.typora-style :deep(h1), .typora-style :deep(h2), .typora-style :deep(h3), .typora-style :deep(h4) { color: var(--text-primary); font-weight: 700; margin-top: 2em; margin-bottom: 1em; letter-spacing: -0.01em; }
.typora-style :deep(h1) { font-size: 28px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
.typora-style :deep(h2) { font-size: 24px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); }
.typora-style :deep(h3) { font-size: 20px; }
.typora-style :deep(p) { margin: 1.2em 0; }
.typora-style :deep(img) { 
  max-width: 100%; 
  display: block; 
  margin: 32px auto; 
  cursor: zoom-in; 
  transition: transform 0.3s ease;
  border: 1px solid var(--border-color);
}
.typora-style :deep(video) { 
  width: 100%;
  max-width: 100%; 
  height: auto;
  display: block; 
  margin: 32px auto; 
  outline: none;
  border: 1px solid var(--border-color);
}
.typora-style :deep(img:hover) { transform: translateY(-2px); border-color: var(--text-secondary); }
.typora-style :deep(blockquote) { 
  margin: 2em 0; 
  padding: 16px 24px; 
  border-left: 4px solid var(--text-secondary); 
  background-color: var(--bg-secondary); 
  color: var(--text-secondary); 
  font-style: italic;
}
.typora-style :deep(code) { 
  font-family: 'JetBrains Mono', monospace; 
  background-color: var(--bg-hover); 
  padding: 3px 6px; 
  font-size: 0.85em; 
  color: var(--danger-color); 
}
.typora-style :deep(pre) { 
  background-color: var(--bg-secondary); 
  color: var(--text-primary);
  padding: 20px; 
  overflow-x: auto; 
  line-height: 1.5; 
  position: relative; 
  border: 1px solid var(--border-color);
  margin: 2em 0;
}
.typora-style :deep(pre::before) { display: none; }
.typora-style :deep(pre[data-lang]) { padding-top: 48px; }
.typora-style :deep(pre[data-lang])::after { 
  content: attr(data-lang); 
  position: absolute; 
  top: 12px; 
  right: 16px; 
  font-size: 12px; 
  color: var(--text-secondary); 
  text-transform: uppercase; 
  font-weight: 600; 
  letter-spacing: 0.5px;
  transition: opacity 0.2s;
  pointer-events: none;
}
.typora-style :deep(.copy-code-btn) {
  position: absolute;
  top: 10px;
  right: 16px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  padding: 4px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}
.typora-style :deep(pre:hover .copy-code-btn) { opacity: 1; }
.typora-style :deep(pre:hover::after) { opacity: 0; }
.typora-style :deep(.copy-code-btn:hover) { color: var(--text-primary); }
.typora-style :deep(pre code) { background-color: transparent; padding: 0; color: inherit; font-size: 15px; }
.typora-style :deep(ul), .typora-style :deep(ol) { padding-left: 2em; margin: 1.2em 0; }
.typora-style :deep(li) { margin: 0.4em 0; }
.typora-style :deep(a) { 
  color: #177ddc; 
  text-decoration: none; 
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s, color 0.2s;
}
.typora-style :deep(a:hover) { 
  color: #1890ff;
  border-bottom-color: #1890ff;
}

/* 表格样式优化 */
.typora-style :deep(table) {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  margin: 2em 0;
  display: block;
  overflow-x: auto;
  white-space: nowrap;
}
.typora-style :deep(th), .typora-style :deep(td) {
  padding: 12px 16px;
  text-align: left;
}
.typora-style :deep(thead th) {
  border-top: 1px solid var(--text-primary);
  border-bottom: 1px solid var(--text-primary);
  font-weight: 600;
  color: var(--text-primary);
}
.typora-style :deep(tbody tr:last-child td) {
  border-bottom: 1px solid var(--text-primary);
}
.typora-style :deep(tbody tr:not(:last-child) td) {
  border-bottom: 1px solid var(--border-color);
}

/* 图片放大弹窗 */
.image-zoom-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.9); display: flex; justify-content: center; align-items: center; z-index: 2000; backdrop-filter: blur(10px); cursor: zoom-out; overflow: hidden; transition: opacity 0.3s; }
.zoomed-image { max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 50px rgba(0, 0, 0, 0.5); user-select: none; -webkit-user-drag: none; }
.zoom-close-btn { position: absolute; top: 30px; right: 30px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 24px; width: 48px; height: 48px; border-radius: 50%; cursor: pointer; display: flex; justify-content: center; align-items: center; transition: all 0.3s ease; backdrop-filter: blur(4px); }
.zoom-close-btn:hover { background: rgba(255, 255, 255, 0.25); transform: rotate(90deg); }

/* ===== 移动端响应式 ===== */
@media (max-width: 767px) {
  .page-wrapper {
    display: block;
  }

  .outline-mobile-mask {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 199;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: fade-in 0.3s ease;
  }

  .outline-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    right: auto;
    width: 85vw !important;
    max-width: 320px;
    height: 100vh;
    border-right: 1px solid var(--border-color);
    background: var(--bg-primary);
    z-index: 200;
    overflow: hidden;
    transform: translateX(-100%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .outline-sidebar.outline-open {
    transform: translateX(0);
    overflow: hidden;
  }

  .outline-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    cursor: pointer;
    padding: 8px;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .outline-close-btn:hover { background: var(--bg-hover); }

  .container {
    padding: 0 20px 80px;
    max-width: 100%;
  }

  .article-title {
    font-size: 28px !important;
  }

  .article-meta {
    flex-wrap: wrap;
    gap: 12px !important;
  }

  .editor-textarea {
    height: 60vh;
  }
}

/* ===== 弹幕系统样式 - 深色版 ===== */

/* 飞行层：限制在上1/4屏，不拦截点击 */
.barrage-layer {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 25vh;
  pointer-events: none;
  z-index: 500;
  overflow: hidden;
}


/* 弹幕条目：透明玻璃背景，圆角设计 */
.barrage-item {
  position: absolute;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.03em;
  padding: 6px 16px;
  border-radius: 20px; /* 圆角弹幕 */
  color: var(--text-primary);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); /* 增加一点阴影使其更立体好看 */
  user-select: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.barrage-item:hover {
  background: var(--glass-hover-bg);
  border-color: var(--glass-hover-border);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.barrage-delete-btn {
  background: transparent;
  border: none;
  color: var(--danger-color);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0;
  width: 0;
  height: 16px;
  margin-left: 0;
  flex-shrink: 0;
  overflow: hidden;
  transform: scale(0.5);
}

.barrage-item:hover .barrage-delete-btn,
.barrage-item:active .barrage-delete-btn {
  opacity: 1;
  width: 16px;
  margin-left: 8px;
  transform: scale(1.1);
}

.barrage-delete-btn:hover {
  background: rgba(255, 77, 79, 0.1);
  transform: scale(1.25) !important;
}


/* ===== 弹幕发送面板（右下角，可拖动） ===== */
.barrage-panel {
  position: fixed;
  bottom: 28px;
  right: 24px;
  z-index: 610;
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(200%);
  -webkit-backdrop-filter: blur(20px) saturate(200%);
  border: 1px solid var(--glass-border);
  padding: 5px 5px 5px 14px;
  cursor: grab;
  user-select: none;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s ease, border-color 0.3s;
}
.barrage-panel:active { cursor: grabbing; }

/* 唤醒状态：轻微放大 */
.barrage-panel--active {
  transform: scale(1.05);
  border-color: var(--text-secondary);
  padding: 6px 6px 6px 16px;
}

.barrage-close-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1;
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s, transform 0.2s, opacity 0.2s;
  flex-shrink: 0;
  opacity: 0;
}
.barrage-panel:hover .barrage-close-btn { opacity: 1; }
.barrage-close-btn:hover { background: var(--bg-hover); color: var(--text-primary); transform: scale(1.1); }

.barrage-panel-body {
  display: flex;
  gap: 6px;
  align-items: center;
}

.barrage-toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-primary);
  opacity: 0.4;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  transition: opacity 0.2s, background 0.2s, color 0.2s;
}
.barrage-toggle-btn:hover {
  opacity: 0.8;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.1);
}

.barrage-panel-input {
  flex: 0 1 auto;
  width: 80px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  padding: 5px 0;
  outline: none;
  caret-color: var(--text-secondary);
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.barrage-panel-input::placeholder { color: var(--text-secondary); font-size: 12px; }

/* 唤醒时输入框拉宽 */
.barrage-panel--active .barrage-panel-input {
  width: 150px;
}

.barrage-panel-send {
  padding: 5px 13px;
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.barrage-panel-send:not(:disabled):hover { background: var(--accent-hover); transform: scale(1.04); }
.barrage-panel-send:disabled { opacity: 0.25; cursor: not-allowed; }

/* 发送按钮淡入淡出 */
.send-fade-enter-active,
.send-fade-leave-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.send-fade-enter-from,
.send-fade-leave-to { opacity: 0; width: 0; padding: 0; margin: 0; overflow: hidden; }

.barrage-msg {
  margin: 8px 0 0;
  font-size: 12px;
  text-align: center;
  font-weight: 500;
  padding: 4px 12px;
}
.barrage-msg--err { color: var(--danger-color); background: rgba(255, 77, 79, 0.1); border: 1px solid var(--danger-color); }
.barrage-msg--ok  { color: var(--success-color); background: rgba(82, 196, 26, 0.1); border: 1px solid var(--success-color); }

/* ===== 半圆唤起按钮 ===== */
.barrage-peek {
  position: fixed;
  right: -22px;
  bottom: 60px;
  width: 52px;
  height: 52px;
  background: rgba(17, 17, 17, 0.8);
  backdrop-filter: blur(16px) saturate(200%);
  -webkit-backdrop-filter: blur(16px) saturate(200%);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 610;
  transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-primary);
  padding-right: 16px;
}
.barrage-peek:hover { right: 0; border-color: var(--text-secondary); }

/* 面板弹出/收起动画 */
.panel-pop-enter-active,
.panel-pop-leave-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.panel-pop-enter-from,
.panel-pop-leave-to { opacity: 0; transform: translateY(12px) scale(0.95); }

/* 半圆滑入动画 */
.peek-slide-enter-active,
.peek-slide-leave-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.peek-slide-enter-from { opacity: 0; right: -60px !important; }
.peek-slide-leave-to { opacity: 0; right: -60px !important; }

/* loading 旋转 */
.btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(0,0,0,0.3);
  border-top-color: var(--bg-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* 提示淡入淡出 */
.fade-msg-enter-active,
.fade-msg-leave-active { transition: opacity 0.3s ease; }
.fade-msg-enter-from,
.fade-msg-leave-to { opacity: 0; }

/* 本人的弹幕样式：用边框颜色和加粗字体区分，保留玻璃质感 */
.barrage-item--self {
  border: 1.5px solid var(--text-primary);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 0 8px var(--glass-border);
}
.barrage-item--self:hover {
  background: var(--glass-hover-bg);
  border-color: var(--text-primary);
}

/* 顶部悬浮提示框 (Toast) */
.floating-toast {
  position: fixed;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 10px 24px;
  font-weight: 500;
  font-size: 14px;
  z-index: 9999;
}

.floating-toast.toast-error {
  background: rgba(255, 77, 79, 0.1);
  color: var(--danger-color);
  border-color: var(--danger-color);
}

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}

/* 移动端 */
@media (max-width: 767px) {
  .barrage-panel {
    right: 12px;
    bottom: 16px;
  }
  .barrage-peek { bottom: 40px; }
}
</style>
