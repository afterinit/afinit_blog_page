<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked, parseMdToJson, processHtml } from '../utils/mdParser.js'
import { assertApiSuccess, getApiSuccessMessage } from '../utils/apiResponse.js'
import { refreshHomePosts } from '../composables/useHomeRefresh.js'
import { useDialog } from '../composables/useDialog.js'
import { useUserInfo } from '../composables/useUserInfo.js'
import request, { AuthError } from '../utils/request.js'

const route = useRoute()
const router = useRouter()
const { userInfo } = useUserInfo()

const articleData = ref(null)
const loading = ref(false)
const error = ref('')

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
    const apiUrl = import.meta.env.VITE_API_BASE_URL
    const endpoint = isPrivate ? `/blog/private/${id}` : `/blog/${id}`
    const response = await request(`${apiUrl}${endpoint}`)
    
    const res = await response.json()
    assertApiSuccess(response, res, [30041], '文章加载失败')

    const data = res.data ? res.data : res

    let dateStr = data.createTime || ''
    if (dateStr) dateStr = dateStr.replace('T', ' ')

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
      summaryHtml: data.summary ? processHtml(marked.parseInline(data.summary)) : '',
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

    const apiUrl = import.meta.env.VITE_API_BASE_URL
    const response = await request(`${apiUrl}/blog`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: String(route.params.id),
        title: parsedData.title,
        summary: parsedData.summary,
        content: parsedData.content
      })
    })
    
    const res = await response.json()
    assertApiSuccess(response, res, [30011], '修改请求失败')

    refreshHomePosts()

    showAlert(getApiSuccessMessage(res, '修改成功！'), () => {
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
    const apiUrl = import.meta.env.VITE_API_BASE_URL
    const response = await request(`${apiUrl}/blog/${route.params.id}`, {
      method: 'DELETE'
    })
    
    const res = await response.json()
    assertApiSuccess(response, res, [20041], '删除请求失败')

    refreshHomePosts()

    showAlert(getApiSuccessMessage(res, '删除成功！'), () => {
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
  if (maxScrollTop.value <= 0) return []
  
  // 按照 scrollPercent 排序，确保从前到后排版
  const sorted = [...storedBarrages.value].sort((a, b) => Number(a.scrollPercent) - Number(b.scrollPercent))
  
  // 记录每个轨道最后一条弹幕的“最右侧”占位（单位：虚拟像素）
  const tracksEnd = new Array(TRACK_COUNT).fill(-99999)
  const speedMultiplier = 1.2
  // 将屏幕像素转换成虚拟像素：30px 间距在虚拟轴上是 30 / speedMultiplier
  const virtualGap = 30 / speedMultiplier
  // 视口一半宽度的虚拟像素（保证极端位置的弹幕也有足够的距离飞入飞出）
  const halfScreenVirtual = (window.innerWidth > 0 ? window.innerWidth / 2 : 500) / speedMultiplier
  // 实际可供分配的内部虚拟滚动长度
  const safeMax = Math.max(0, maxScrollTop.value - 2 * halfScreenVirtual)
  
  return sorted.map(b => {
    // 弹幕的原始虚拟锚点：0% 映射到起始边缘缓冲，100% 映射到结束边缘缓冲
    const mappedPercent = Number(b.scrollPercent) / 100
    const basePixelX = halfScreenVirtual + mappedPercent * safeMax
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
    const apiUrl = import.meta.env.VITE_API_BASE_URL
    const response = await request(`${apiUrl}/barrage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blogId,
        content: barrageInput.value.trim(),
        scrollPercent
      })
    })
    const res = await response.json()
    if (res.code === 30051 || res.code === '30051') {
      storedBarrages.value.push({
        id: 'new-' + Date.now(),
        content: barrageInput.value.trim(),
        scrollPercent,
        userId: userInfo.value?.id,
        _randY: Math.floor(Math.random() * 20 - 10), // 上下错位: -10px 到 +10px
        _randX: Math.floor(Math.random() * 60 - 30)  // 左右错位: -30px 到 +30px
      })
      barrageInput.value = ''
      showToast('🎉 弹幕已发出！')
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

// 加载历史弹幕：GET /barrage/{blogId}
const loadBarrages = async () => {
  try {
    const blogId = Number(route.params.id)
    const apiUrl = import.meta.env.VITE_API_BASE_URL
    const response = await request(`${apiUrl}/barrage/${blogId}`)
    const res = await response.json()
    if (Array.isArray(res.data)) {
      storedBarrages.value = res.data.map((b, i) => ({
        ...b,
        id: String(b.id ?? `hist-${i}`),
        scrollPercent: Number(b.scrollPercent),
        _randY: Math.floor(Math.random() * 20 - 10), // 上下错位: -10px 到 +10px
        _randX: Math.floor(Math.random() * 60 - 30)  // 左右错位: -30px 到 +30px
      }))
      // 加载完成后初始化滚动信息
      await nextTick()
      updateScrollInfo()
    }
  } catch {
    // 静默忽略
  }
}

const handleGlobalClick = (e) => {
  // 如果面板处于激活状态，且点击的区域不是面板本体或唤起按钮，则自动收起
  if (barrageInputActive.value && e.target && !e.target.closest('.barrage-panel') && !e.target.closest('.barrage-peek')) {
    barrageInputActive.value = false
    barrageError.value = '' // 点击外部收起时隐藏错误信息
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
    const apiUrl = import.meta.env.VITE_API_BASE_URL
    const response = await request(`${apiUrl}/barrage/${id}`, {
      method: 'DELETE'
    })
    const res = await response.json()
    if (res.code === 30061 || res.code === '30061') {
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
    <div class="barrage-layer" aria-hidden="true" v-show="barrageEnabled">
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
        v-if="panelVisible"
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
      <button v-if="!panelVisible" class="barrage-peek" @click="showPanel" title="发弹幕">
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
  background: #fdfdfd;
  color: #333;
  min-height: 100vh;
}

/* ===== 大纲侧边栏（桌面端） ===== */
.outline-sidebar {
  position: sticky;
  top: 0;
  width: 0;
  height: 100vh;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
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
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 1px 0 15px rgba(0,0,0,0.02);
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
  color: #888;
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
.outline-content::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 4px; }
.outline-content::-webkit-scrollbar-thumb:hover { background: #ccc; }

.outline-item {
  display: block;
  padding: 8px 12px;
  color: #666;
  text-decoration: none;
  font-size: 14px;
  line-height: 1.5;
  transition: all 0.25s ease;
  border-radius: 6px;
  white-space: normal;
  word-break: break-word;
  margin-bottom: 4px;
  position: relative;
}

.outline-item:hover {
  background-color: rgba(0,0,0,0.04);
  color: #111;
  transform: translateX(2px);
}

.outline-empty {
  padding: 20px;
  color: #999;
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
  background: rgba(253, 253, 253, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(0,0,0,0.04);
  transition: all 0.3s ease;
}

.sidebar-toggle-btn {
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: background 0.2s, color 0.2s, transform 0.2s;
}

.sidebar-toggle-btn:hover {
  background: #f0f0f0;
  color: #111;
  transform: scale(1.05);
}

.back-btn { 
  background: transparent; 
  border: none; 
  font-size: 14px; 
  color: #666; 
  font-weight: 500;
  cursor: pointer; 
  padding: 8px 12px; 
  border-radius: 8px;
  transition: all 0.2s ease;
}
.back-btn:hover { background: #f0f0f0; color: #111; }

.action-buttons { display: flex; gap: 12px; }

.btn { 
  padding: 8px 16px; 
  background-color: #111; 
  color: #fff; 
  border: 1px solid #111; 
  border-radius: 4px; 
  font-size: 13px; 
  font-weight: 500;
  cursor: pointer; 
  transition: all 0.25s ease; 
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}
.btn:hover { background-color: #333; transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,0.15); }
.btn-sm { padding: 6px 12px; font-size: 12px; }

.btn-outline { 
  background-color: transparent; 
  color: #333; 
  border-color: #ddd; 
  box-shadow: none;
}
.btn-outline:hover { 
  background-color: #f5f5f5; 
  border-color: #bbb; 
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
}

.btn-danger { color: #d32f2f; border-color: #ffcdd2; }
.btn-danger:hover { background-color: #ffebee; border-color: #d32f2f; color: #d32f2f; box-shadow: 0 4px 10px rgba(211,47,47,0.15); }

/* 弹窗样式 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.3); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(6px); }
.modal-content { background: #fff; padding: 40px; border-radius: 16px; width: 340px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); transform: scale(1); animation: modal-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes modal-pop { 0% { transform: scale(0.95); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.modal-content h3 { margin: 0 0 12px 0; font-size: 20px; color: #111; font-weight: 600; }
.modal-content p { margin: 0 0 32px 0; font-size: 15px; color: #555; line-height: 1.6; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
.modal-actions .btn-danger { background-color: #d32f2f; color: #fff; border-color: #d32f2f; }
.modal-actions .btn-danger:hover { background-color: #b71c1c; }

.status-msg { text-align: center; color: #999; margin-top: 120px; font-size: 15px; font-weight: 500; }
.status-msg.error { color: #d32f2f; }

/* 编辑模式样式 */
.edit-mode { display: flex; flex-direction: column; background: #fff; border: 1px solid #eaeaea; border-radius: 12px; padding: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); }
.edit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #f0f0f0;}
.editor-textarea { width: 100%; height: 60vh; padding: 20px; border: 1px solid #ddd; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.6; resize: vertical; box-sizing: border-box; outline: none; transition: border-color 0.3s; }
.editor-textarea:focus { border-color: #111; box-shadow: 0 0 0 3px rgba(0,0,0,0.05); }
.form-actions { display: flex; gap: 12px; margin-top: 24px; }

/* Typora 主题文章样式 */
.article-render { animation: fade-in 0.6s ease-out; }
@keyframes fade-in { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }

.article-title { font-size: 40px; font-weight: 800; color: #111; margin: 0 0 24px 0; line-height: 1.3; letter-spacing: -0.03em; }

.article-summary { 
  font-size: 16px; 
  color: #444; 
  background: linear-gradient(135deg, #fdfbfb 0%, #f3f4f6 100%);
  padding: 20px 24px; 
  border-left: 4px solid #111; 
  margin: 0 0 24px 0; 
  border-radius: 0 8px 8px 0; 
  box-shadow: 0 4px 12px rgba(0,0,0,0.02);
  line-height: 1.6;
}

.article-meta { 
  display: flex; 
  align-items: center;
  flex-wrap: wrap;
  gap: 20px; 
  font-size: 14px; 
  color: #777; 
  margin-bottom: 48px; 
  padding-bottom: 24px; 
  border-bottom: 1px solid rgba(0,0,0,0.06); 
  font-weight: 500;
}
.article-meta span { display: flex; align-items: center; gap: 6px; }

/* Typora HTML 渲染细节样式 */
.typora-style { font-size: 17px; line-height: 1.85; color: #333; }
.typora-style :deep(h1), .typora-style :deep(h2), .typora-style :deep(h3), .typora-style :deep(h4) { color: #111; font-weight: 700; margin-top: 2em; margin-bottom: 1em; letter-spacing: -0.01em; }
.typora-style :deep(h1) { font-size: 28px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.06); }
.typora-style :deep(h2) { font-size: 24px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.06); }
.typora-style :deep(h3) { font-size: 20px; }
.typora-style :deep(p) { margin: 1.2em 0; }
.typora-style :deep(img) { 
  max-width: 100%; 
  display: block; 
  margin: 32px auto; 
  border-radius: 8px; 
  box-shadow: 0 8px 30px rgba(0,0,0,0.08); 
  cursor: zoom-in; 
  transition: transform 0.3s ease;
}
.typora-style :deep(video) { 
  width: 100%;
  max-width: 100%; 
  height: auto;
  display: block; 
  margin: 32px auto; 
  border-radius: 8px; 
  box-shadow: 0 8px 30px rgba(0,0,0,0.08); 
  outline: none;
}
.typora-style :deep(img:hover) { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.12); }
.typora-style :deep(blockquote) { 
  margin: 2em 0; 
  padding: 16px 24px; 
  border-left: 4px solid #ddd; 
  background-color: #fafafa; 
  color: #555; 
  font-style: italic;
  border-radius: 0 8px 8px 0;
}
.typora-style :deep(code) { 
  font-family: 'JetBrains Mono', monospace; 
  background-color: #f0f1f3; 
  padding: 3px 6px; 
  border-radius: 6px; 
  font-size: 0.85em; 
  color: #d13a69; 
}
.typora-style :deep(pre) { 
  background-color: #ffffff; 
  color: #333;
  padding: 20px; 
  border-radius: 12px; 
  overflow-x: auto; 
  line-height: 1.5; 
  position: relative; 
  box-shadow: 0 10px 30px rgba(0,0,0,0.05);
  border: 1px solid rgba(0,0,0,0.06);
  margin: 2em 0;
}
.typora-style :deep(pre::before) {
  content: '';
  display: block;
  position: absolute;
  top: 16px;
  left: 16px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff5f56;
  box-shadow: 20px 0 0 #ffbd2e, 40px 0 0 #27c93f;
}
.typora-style :deep(pre[data-lang]) { padding-top: 48px; }
.typora-style :deep(pre[data-lang])::after { 
  content: attr(data-lang); 
  position: absolute; 
  top: 12px; 
  right: 16px; 
  font-size: 12px; 
  color: #888; 
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
  color: #666;
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
.typora-style :deep(.copy-code-btn:hover) { color: #111; }
.typora-style :deep(pre code) { background-color: transparent; padding: 0; color: inherit; font-size: 15px; }
.typora-style :deep(ul), .typora-style :deep(ol) { padding-left: 2em; margin: 1.2em 0; }
.typora-style :deep(li) { margin: 0.4em 0; }
.typora-style :deep(a) { 
  color: #0366d6; 
  text-decoration: none; 
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s, color 0.2s;
}
.typora-style :deep(a:hover) { 
  color: #005cc5;
  border-bottom-color: #005cc5;
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
  border-top: 1px solid #111;
  border-bottom: 1px solid #111;
  font-weight: 600;
  color: #111;
}
.typora-style :deep(tbody tr:last-child td) {
  border-bottom: 1px solid #111;
}
.typora-style :deep(tbody tr:not(:last-child) td) {
  border-bottom: 1px solid rgba(0,0,0,0.06);
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
    background: rgba(0, 0, 0, 0.5);
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
    border-right: none;
    border-radius: 0 20px 20px 0;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    box-shadow: 4px 0 30px rgba(0, 0, 0, 0.15);
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
    background: #f5f5f5;
    border: none;
    color: #333;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .outline-close-btn:hover { background: #e0e0e0; }

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

/* ===== 弹幕系统样式 ===== */

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


/* 弹幕条目：透明玻璃背景 + 黑色字体 */
.barrage-item {
  position: absolute;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.03em;
  padding: 6px 16px;
  color: #1a1a1a;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  user-select: none;
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.8);
  display: flex;
  align-items: center;
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.barrage-item:hover {
  background: rgba(255, 255, 255, 0.85);
  z-index: 10;
}

.barrage-delete-btn {
  background: transparent;
  border: none;
  color: #ff4d4f;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
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
  background: rgba(255, 255, 255, 0.38);
  backdrop-filter: blur(20px) saturate(200%);
  -webkit-backdrop-filter: blur(20px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 999px;
  padding: 5px 5px 5px 14px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9);
  cursor: grab;
  user-select: none;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.3s ease,
              padding 0.3s ease;
}
.barrage-panel:active { cursor: grabbing; }

/* 唤醒状态：轻微放大 */
.barrage-panel--active {
  transform: scale(1.05);
  box-shadow: 0 6px 28px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9);
  padding: 6px 6px 6px 16px;
}

.barrage-close-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  background: rgba(255,255,255,0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0,0,0,0.08);
  color: rgba(0,0,0,0.4);
  font-size: 13px;
  line-height: 1;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s, transform 0.2s, opacity 0.2s;
  flex-shrink: 0;
  opacity: 0;
}
.barrage-panel:hover .barrage-close-btn { opacity: 1; }
.barrage-close-btn:hover { background: rgba(0,0,0,0.08); color: #111; transform: scale(1.1); }

.barrage-panel-body {
  display: flex;
  gap: 6px;
  align-items: center;
}

.barrage-toggle-btn {
  background: transparent;
  border: none;
  color: #1a1a1a;
  opacity: 0.4;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 50%;
  transition: opacity 0.2s, background 0.2s, color 0.2s;
}
.barrage-toggle-btn:hover {
  opacity: 0.8;
  color: #000;
  background: rgba(0, 0, 0, 0.05);
}

.barrage-panel-input {
  flex: 0 1 auto;
  width: 80px;
  background: transparent;
  border: none;
  color: #1a1a1a;
  font-size: 13px;
  font-family: inherit;
  padding: 5px 0;
  outline: none;
  caret-color: #555;
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.barrage-panel-input::placeholder { color: rgba(0, 0, 0, 0.32); font-size: 12px; }

/* 唤醒时输入框拉宽 */
.barrage-panel--active .barrage-panel-input {
  width: 150px;
}

.barrage-panel-send {
  padding: 5px 13px;
  background: rgba(20, 20, 20, 0.72);
  color: #fff;
  border: none;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 0.2s, transform 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.barrage-panel-send:not(:disabled):hover { background: rgba(0,0,0,0.88); transform: scale(1.04); }
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
  border-radius: 999px;
}
.barrage-msg--err { color: #c0392b; background: rgba(255,220,220,0.6); }
.barrage-msg--ok  { color: #1a6b3a; background: rgba(200,255,220,0.6); }

/* ===== 半圆唤起按钮 ===== */
.barrage-peek {
  position: fixed;
  right: -22px;
  bottom: 60px;
  width: 52px;
  height: 52px;
  background: rgba(255, 255, 255, 0.48);
  backdrop-filter: blur(16px) saturate(200%);
  -webkit-backdrop-filter: blur(16px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 610;
  box-shadow: -3px 0 18px rgba(0,0,0,0.1);
  transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s;
  color: #333;
  padding-right: 16px;
}
.barrage-peek:hover { right: -8px; box-shadow: -4px 0 24px rgba(0,0,0,0.14); }

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
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* 提示淡入淡出 */
.fade-msg-enter-active,
.fade-msg-leave-active { transition: opacity 0.3s ease; }
.fade-msg-enter-from,
.fade-msg-leave-to { opacity: 0; }

/* 本人的弹幕样式：极其醒目的白底黑框以示区分 */
.barrage-item--self {
  background: #ffffff;
  border: 1.5px solid #111;
  color: #111;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.barrage-item--self:hover {
  background: #ffffff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

/* 顶部悬浮提示框 (Toast) */
.floating-toast {
  position: fixed;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 30, 30, 0.85);
  color: #fff;
  padding: 10px 24px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}

.floating-toast.toast-error {
  background: rgba(220, 53, 69, 0.9);
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
