<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { commentApi } from '@/api/comment.js'
import { useUserInfo } from '@/composables/useUserInfo.js'
import { formatLocalTime } from '@/utils/timeFormat.js'
import { ROUTE_NAMES } from '@/constants/routes.js'
import CommentItem from './CommentItem.vue'

const props = defineProps({
  blogId: {
    type: [String, Number],
    required: true
  },
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'update:totalCount', 'backdrop-pointer'])

const route = useRoute()
const router = useRouter()
const { userInfo, isLoggedIn, resolveAvatarUrl } = useUserInfo()

// ─── 评论数据与状态 ────────────────────────────────────────────────────────────

const comments = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const totalPages = ref(1)
const loading = ref(false)
const listError = ref('')

// 头像加载错误集合（若加载失败自动回退到默认个人资料圆形字母头像）
const avatarErrors = ref(new Set())

// 底部常驻吸底输入框
const inputContent = ref('')
const submitting = ref(false)
const inputCharLimit = 1000

// 正在回复的目标对象
// activeReply = { targetNode, rootComment, parentId, replyId, targetNickname }
const activeReply = ref(null)

// 登录拦截弹窗
const showLoginPrompt = ref(false)
const loginPromptMsg = ref('请先登录后再参与评论与互动')

// Toast 提示
const toastMessage = ref('')
const toastIsError = ref(false)
let toastTimer = null

function showToast(msg, isError = false) {
  toastMessage.value = msg
  toastIsError.value = isError
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
}

/**
 * 默认头像首字母计算，与个人资料 AvatarUpload.vue 完全保持一致
 */
function getAvatarLetter(name) {
  if (!name || typeof name !== 'string') return 'U'
  return name.trim().charAt(0).toUpperCase() || 'U'
}

function checkLogin(actionDesc = '参与评论') {
  if (!isLoggedIn.value) {
    loginPromptMsg.value = `需要登录后才能${actionDesc}，是否立即前往登录？`
    showLoginPrompt.value = true
    return false
  }
  return true
}

function goToLogin() {
  showLoginPrompt.value = false
  router.push({
    name: ROUTE_NAMES.LOGIN,
    query: { redirect: route.fullPath }
  })
}

function closeDrawer() {
  emit('update:modelValue', false)
}

// ─── 节点标准化 ────────────────────────────────────────────────────────────────

function normalizeNode(item, rootId) {
  const countVal = item.count !== undefined ? item.count : (item.replyCount !== undefined ? item.replyCount : 0)
  const numCount = Number(countVal) || 0
  return {
    ...item,
    id: String(item.id),
    userId: item.userId != null ? String(item.userId) : '',
    blogId: String(item.blogId || props.blogId),
    avatar: item.avatar || '',
    parentId: item.parentId != null ? String(item.parentId) : null,
    replyId: item.replyId != null ? String(item.replyId) : null,
    replyUserId: item.replyUserId != null ? String(item.replyUserId) : null,
    replyNickname: item.replyNickname || '',
    rootCommentId: rootId || String(item.parentId || item.id),
    replyCount: numCount,
    count: numCount,
    replies: [],
    repliesLoading: false,
    repliesLoaded: false,
    repliesExpanded: false,
    repliesPage: 1,
    repliesPages: 1,
    repliesTotal: 0
  }
}

// ─── 获取总评论数（通过新接口 /comment/{blogId}） ──────────────────────────────

async function fetchTotalCount() {
  if (!props.blogId) return
  try {
    const res = await commentApi.getCommentCount(props.blogId)
    if (res && res.success && typeof res.data === 'number') {
      total.value = res.data
      emit('update:totalCount', res.data)
    }
  } catch {
    // 静默降级
  }
}

// ─── 加载根评论列表 ────────────────────────────────────────────────────────────

async function fetchRootComments(page = 1) {
  if (!props.blogId) return
  loading.value = true
  listError.value = ''

  try {
    const res = await commentApi.getComments({
      blogId: String(props.blogId),
      page,
      size: pageSize.value
    })

    const data = res?.data || {}
    const records = Array.isArray(data.records) ? data.records : []

    comments.value = records.map(item => normalizeNode(item, String(item.id)))

    currentPage.value = Number(data.current || page)
    totalPages.value = Number(data.pages || 1)
    
    // 同步拉取最新的独立总评论数
    fetchTotalCount()
  } catch (err) {
    listError.value = err.message || '加载评论失败'
  } finally {
    loading.value = false
  }
}

// ─── 加载二级回复列表 ─────────────────────────────────────────────────────────

/**
 * 加载根评论下的二级回复列表
 * @param {Object} rootComment - 所属的根评论
 * @param {number} page - 页码
 */
async function fetchNodeReplies(rootComment, page = 1) {
  if (!props.blogId || !rootComment) return
  rootComment.repliesLoading = true

  try {
    const queryParams = {
      blogId: String(props.blogId),
      page,
      size: 10,
      parentId: String(rootComment.id)
    }

    const res = await commentApi.getComments(queryParams)
    const data = res?.data || {}
    const records = (Array.isArray(data.records) ? data.records : []).map(child =>
      normalizeNode(child, String(rootComment.id))
    )

    if (page === 1) {
      rootComment.replies = records
    } else {
      rootComment.replies = [...rootComment.replies, ...records]
    }

    rootComment.repliesPage = Number(data.current || page)
    rootComment.repliesPages = Number(data.pages || 1)
    rootComment.repliesTotal = Number(data.total || 0)
    rootComment.repliesLoaded = true

    rootComment.replyCount = rootComment.repliesTotal
    rootComment.count = rootComment.repliesTotal
  } catch (err) {
    showToast(err.message || '获取回复列表失败', true)
  } finally {
    rootComment.repliesLoading = false
  }
}

async function toggleNodeReplies(rootComment) {
  if (!rootComment) return
  if (rootComment.repliesExpanded) {
    rootComment.repliesExpanded = false
    return
  }

  // 一次只允许展开一条：展开当前评论时，自动收起其他所有已展开的根评论
  for (const c of comments.value) {
    if (String(c.id) !== String(rootComment.id)) {
      c.repliesExpanded = false
    }
  }

  rootComment.repliesExpanded = true
  if (!rootComment.repliesLoaded) {
    await fetchNodeReplies(rootComment, 1)
  }
}

async function loadMoreNodeReplies(rootComment) {
  if (!rootComment) return
  if (rootComment.repliesPage < rootComment.repliesPages && !rootComment.repliesLoading) {
    await fetchNodeReplies(rootComment, rootComment.repliesPage + 1)
  }
}

// ─── 互动：点击 @昵称 定位跳转至对应评论 ───────────────────────────────────────

async function scrollToComment(targetId, rootComment) {
  if (!targetId) return

  // 1. 如果所属根评论未展开，先将其展开
  if (rootComment && !rootComment.repliesExpanded) {
    await toggleNodeReplies(rootComment)
  }

  // 2. 尝试在 DOM 中直接查找目标评论元素
  let targetEl = document.getElementById(`comment-node-${targetId}`)

  // 3. 如果元素不在当前 DOM 中，且所属根评论还有后续回复页未加载，依次加载更多页直到找到目标
  if (!targetEl && rootComment && rootComment.repliesPage < rootComment.repliesPages) {
    showToast('正在定位目标评论...', false)
    while (!targetEl && rootComment.repliesPage < rootComment.repliesPages) {
      await fetchNodeReplies(rootComment, rootComment.repliesPage + 1)
      await new Promise(resolve => setTimeout(resolve, 60))
      targetEl = document.getElementById(`comment-node-${targetId}`)
    }
  }

  // 4. 定位并触发高亮脉冲
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    targetEl.classList.remove('comment-highlight')
    void targetEl.offsetWidth // 触发重排以重新激活动画
    targetEl.classList.add('comment-highlight')
    setTimeout(() => {
      targetEl.classList.remove('comment-highlight')
    }, 2500)
  } else {
    showToast('未找到被回复的评论（可能已被删除）', true)
  }
}

// ─── 互动：设置回复目标 ────────────────────────────────────────────────────────

function setReplyTarget(targetNode, rootComment) {
  if (!checkLogin('回复他人')) return

  const isRoot = String(targetNode.id) === String(rootComment.id)
  const rootId = String(rootComment.id)
  activeReply.value = {
    targetNode,
    rootComment,
    parentId: rootId,
    // 回复父评论时，replyId 与 parentId 保持一致；回复子评论时传子评论 ID
    replyId: isRoot ? rootId : String(targetNode.id),
    // 被回复人的用户 ID
    replyUserId: targetNode.userId != null ? String(targetNode.userId) : null,
    targetNickname: targetNode.nickname || '该用户'
  }

  // 平滑聚焦底部输入框
  const inputEl = document.getElementById('drawer-comment-input')
  if (inputEl) {
    inputEl.focus()
  }
}

function cancelReply() {
  activeReply.value = null
}

// ─── 删除评论逻辑 ──────────────────────────────────────────────────────────────

const deleteConfirm = ref({
  show: false,
  loading: false,
  targetComment: null,
  rootComment: null
})

function openDeleteConfirm(targetComment, rootComment) {
  deleteConfirm.value = {
    show: true,
    loading: false,
    targetComment,
    rootComment
  }
}

async function confirmDeleteComment() {
  const { targetComment, rootComment } = deleteConfirm.value
  if (!targetComment || !targetComment.id) return

  deleteConfirm.value.loading = true
  try {
    const res = await commentApi.deleteComment(targetComment.id)
    showToast(res?.msg || '删除成功')

    // 记录删除前展开了哪些根评论
    const expandedIds = new Set(
      comments.value.filter(c => c.repliesExpanded).map(c => String(c.id))
    )

    const isRoot = !rootComment || String(targetComment.id) === String(rootComment.id)

    // 如果当前输入框正在针对被删除的评论进行回复，取消回复状态
    if (activeReply.value && String(activeReply.value.targetNode?.id) === String(targetComment.id)) {
      cancelReply()
    }

    // 关闭确认弹窗
    deleteConfirm.value.show = false

    // 同步最新的总评论数
    fetchTotalCount()

    // 重新获取评论列表显示
    if (isRoot) {
      // 删除了根评论：从展开列表中移除该项
      expandedIds.delete(String(targetComment.id))
      // 如果当前页删空了且不是第一页，则加载上一页
      const targetPage = (comments.value.length <= 1 && currentPage.value > 1)
        ? currentPage.value - 1
        : currentPage.value
      await fetchRootComments(targetPage)
    } else {
      // 删除了二级子回复：重新获取根评论列表（同步最新的子评论数）
      await fetchRootComments(currentPage.value)
    }

    // 重新获取列表后，恢复此前处于展开状态的根评论并拉取最新的回复列表
    if (expandedIds.size > 0) {
      for (const item of comments.value) {
        if (expandedIds.has(String(item.id))) {
          if (item.replyCount > 0) {
            item.repliesExpanded = true
            await fetchNodeReplies(item, 1)
          } else {
            item.repliesExpanded = false
          }
        }
      }
    }
  } catch (err) {
    showToast(err.message || '删除失败', true)
  } finally {
    deleteConfirm.value.loading = false
  }
}

// ─── 发表评论 / 发表回复 ──────────────────────────────────────────────────────

async function handleSend() {
  if (!checkLogin('发表评论')) return
  const content = inputContent.value.trim()
  if (!content) {
    showToast('评论内容不能为空', true)
    return
  }
  if (content.length > inputCharLimit) {
    showToast(`内容不能超过 ${inputCharLimit} 字`, true)
    return
  }

  submitting.value = true
  try {
    if (activeReply.value) {
      // 提交针对某评论的回复
      const { rootComment, targetNode, parentId, replyId, replyUserId } = activeReply.value
      const targetUserId = replyUserId || targetNode?.userId
      const res = await commentApi.sendComment({
        blogId: String(props.blogId),
        parentId,
        // 回复父评论时，replyId 与 parentId 保持一致
        replyId: replyId || parentId,
        // 回复给谁就填谁的用户id
        replyUserId: targetUserId != null ? String(targetUserId) : undefined,
        content
      })

      showToast(res.msg || '回复成功')
      cancelReply()
      inputContent.value = ''

      // 实时更新回复计数
      targetNode.replyCount = (targetNode.replyCount || 0) + 1
      targetNode.count = targetNode.replyCount
      if (String(targetNode.id) !== String(rootComment.id)) {
        rootComment.replyCount = (rootComment.replyCount || 0) + 1
        rootComment.count = rootComment.replyCount
      }

      // 刷新总评论数
      fetchTotalCount()

      // 展开根评论并刷新二级回复列表（保证互斥，收起其他评论）
      for (const c of comments.value) {
        if (String(c.id) !== String(rootComment.id)) {
          c.repliesExpanded = false
        }
      }
      rootComment.repliesExpanded = true
      await fetchNodeReplies(rootComment, 1)
    } else {
      // 提交顶级根评论
      const res = await commentApi.sendComment({
        blogId: String(props.blogId),
        content
      })
      showToast(res.msg || '评论发表成功')
      inputContent.value = ''
      
      // 刷新总数和根列表
      fetchTotalCount()
      await fetchRootComments(1)
    }
  } catch (err) {
    showToast(err.message || '发表失败', true)
  } finally {
    submitting.value = false
  }
}

function handlePageChange(newPage) {
  if (newPage < 1 || newPage > totalPages.value || newPage === currentPage.value) return
  fetchRootComments(newPage)
  const bodyEl = document.getElementById('drawer-scroll-body')
  if (bodyEl) bodyEl.scrollTo({ top: 0, behavior: 'smooth' })
}

function handleKeyDown(e) {
  if (e.key === 'Escape' && props.modelValue) {
    if (activeReply.value) {
      cancelReply()
    } else {
      closeDrawer()
    }
  }
}

// ─── 监听与生命周期 ────────────────────────────────────────────────────────────

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    fetchTotalCount()
    if (comments.value.length === 0) {
      fetchRootComments(1)
    }
  }
})

watch(() => props.blogId, (newId) => {
  if (newId) {
    comments.value = []
    if (props.modelValue) {
      fetchTotalCount()
      fetchRootComments(1)
    }
  }
})

const drawerPanelRef = ref(null)

/**
 * 电脑端滚轮事件隔离：
 * 鼠标在评论区抽屉内滑动时，评论区滚动而背景保持绝对静止；
 * 在背景区域滑动时，背景才正常滚动。
 */
function handlePanelWheel(e) {
  const scrollBody = document.getElementById('drawer-scroll-body')
  if (!scrollBody) {
    e.preventDefault()
    return
  }

  const delta = e.deltaY
  const atTop = scrollBody.scrollTop <= 0 && delta < 0
  const atBottom =
    scrollBody.scrollTop + scrollBody.clientHeight >= scrollBody.scrollHeight - 1 && delta > 0

  // 1. 抽屉滚动到达顶部继续向上滑，或到达底部继续向下滑：阻止传递给背景，让背景保持绝对不动
  if (atTop || atBottom) {
    e.preventDefault()
    return
  }

  // 2. 鼠标如果在抽屉头部、底部等非直接滚动区滑动，直接滚动列表并阻止背景滚动
  if (!scrollBody.contains(e.target)) {
    scrollBody.scrollTop += delta
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  if (drawerPanelRef.value) {
    drawerPanelRef.value.addEventListener('wheel', handlePanelWheel, { passive: false })
  }
  if (props.blogId && props.modelValue) {
    fetchTotalCount()
    fetchRootComments(1)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (drawerPanelRef.value) {
    drawerPanelRef.value.removeEventListener('wheel', handlePanelWheel)
  }
})
</script>

<template>
  <Teleport to="body">
    <div class="comment-drawer-wrapper" :class="{ 'is-open': modelValue }">
    <!-- 渐变遮罩，点击收起抽屉 -->
    <transition name="drawer-mask-fade">
      <div
        v-if="modelValue"
        class="drawer-backdrop"
        aria-hidden="true"
        @click="closeDrawer"
        @pointermove="emit('backdrop-pointer', $event)"
        @pointerleave="emit('backdrop-pointer', null)"
      ></div>
    </transition>

    <!-- 侧边抽屉面板 -->
    <aside
      ref="drawerPanelRef"
      class="drawer-panel"
      :class="{ 'panel-open': modelValue }"
      :inert="!modelValue"
    >
      <!-- 抽屉顶部栏 -->
      <header class="drawer-header">
        <div class="header-left">
          <h3 class="drawer-title">评论</h3>
          <span class="total-badge">({{ total }})</span>
        </div>
        <div class="header-actions">
          <button class="icon-btn" @click="fetchRootComments(currentPage)" title="刷新评论">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
          <button class="icon-btn close-btn" @click="closeDrawer" title="关闭评论区 (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <!-- 抽屉滚动内容流 -->
      <main id="drawer-scroll-body" class="drawer-body">
        <div v-if="loading && comments.length === 0" class="drawer-status">
          <span class="spinner-small"></span>
          <span>加载评论中...</span>
        </div>

        <div v-else-if="listError" class="drawer-status status-error">
          <p>{{ listError }}</p>
          <button class="btn-retry" @click="fetchRootComments(currentPage)">重试</button>
        </div>

        <div v-else-if="comments.length === 0" class="drawer-empty">
          <div class="empty-icon">💬</div>
          <p>暂无评论，留下你的精彩见解吧~</p>
        </div>

        <!-- 根评论列表（只分两级：根评论 + 展开的二级回复） -->
        <div v-else class="comment-items">
          <CommentItem
            v-for="root in comments"
            :key="root.id"
            :comment="root"
            :avatar-errors="avatarErrors"
            :resolve-avatar-url="resolveAvatarUrl"
            :get-avatar-letter="getAvatarLetter"
            :format-local-time="formatLocalTime"
            @reply="setReplyTarget"
            @delete="openDeleteConfirm"
            @toggle-replies="toggleNodeReplies"
            @load-more-replies="loadMoreNodeReplies"
            @jump-to-reply="scrollToComment"
          />
        </div>

        <!-- 根评论分页 -->
        <div v-if="totalPages > 1" class="drawer-pagination">
          <button
            class="pg-btn"
            :disabled="currentPage <= 1 || loading"
            @click="handlePageChange(currentPage - 1)"
          >
            上一页
          </button>
          <span class="pg-text">{{ currentPage }} / {{ totalPages }}</span>
          <button
            class="pg-btn"
            :disabled="currentPage >= totalPages || loading"
            @click="handlePageChange(currentPage + 1)"
          >
            下一页
          </button>
        </div>
      </main>

      <!-- 抽屉底部常驻吸底输入栏（短视频交互风格） -->
      <footer class="drawer-footer">
        <!-- 正在回复谁的横条提示 -->
        <transition name="reply-bar-slide">
          <div v-if="activeReply" class="replying-banner">
            <span class="replying-text">回复 @{{ activeReply.targetNickname }}</span>
            <button class="cancel-reply-btn" @click="cancelReply" title="取消回复">×</button>
          </div>
        </transition>

        <div class="footer-input-row">
          <!-- 当前登录用户的圆形头像 -->
          <div class="footer-my-avatar user-avatar">
            <img
              v-if="userInfo?.avatar && !avatarErrors.has('me')"
              :src="resolveAvatarUrl(userInfo.avatar)"
              class="avatar-img user-avatar"
              alt="me"
              @error="avatarErrors.add('me')"
            />
            <div v-else class="avatar-letter user-avatar">
              {{ getAvatarLetter(userInfo?.nickname) }}
            </div>
          </div>

          <div class="input-wrapper">
            <input
              id="drawer-comment-input"
              class="drawer-input"
              v-model="inputContent"
              :placeholder="activeReply ? `回复 @${activeReply.targetNickname}...` : (isLoggedIn ? '留下善意的评论...' : '登录后发表评论...')"
              :maxlength="inputCharLimit"
              @keydown.enter.prevent="handleSend"
              @focus="!isLoggedIn && checkLogin('发表评论')"
            />
          </div>

          <button
            type="button"
            class="drawer-send-btn"
            :disabled="submitting || !inputContent.trim()"
            @click="handleSend"
          >
            <span v-if="!submitting">发送</span>
            <span v-else class="btn-spinner"></span>
          </button>
        </div>
      </footer>
    </aside>

    <!-- 登录拦截弹窗 -->
    <div v-if="showLoginPrompt" class="drawer-modal-backdrop" @click="showLoginPrompt = false">
      <div class="drawer-modal" @click.stop>
        <div class="modal-title-row">
          <h4>需要登录</h4>
          <button class="modal-x" @click="showLoginPrompt = false">×</button>
        </div>
        <p class="modal-body-text">{{ loginPromptMsg }}</p>
        <div class="modal-foot">
          <button class="btn-m-cancel" @click="showLoginPrompt = false">取消</button>
          <button class="btn-m-login" @click="goToLogin">去登录</button>
        </div>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="deleteConfirm.show" class="drawer-modal-backdrop" @click="deleteConfirm.show = false">
      <div class="drawer-modal" @click.stop>
        <div class="modal-title-row">
          <h4>删除评论</h4>
          <button class="modal-x" @click="deleteConfirm.show = false">×</button>
        </div>
        <p class="modal-body-text">确定要删除这条评论吗？删除后不可恢复。</p>
        <div class="modal-foot">
          <button class="btn-m-cancel" :disabled="deleteConfirm.loading" @click="deleteConfirm.show = false">取消</button>
          <button class="btn-m-danger" :disabled="deleteConfirm.loading" @click="confirmDeleteComment">
            {{ deleteConfirm.loading ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 悬浮 Toast -->
    <transition name="toast-pop">
      <div v-if="toastMessage" class="drawer-toast" :class="{ 'toast-err': toastIsError }">
        {{ toastMessage }}
      </div>
    </transition>
    </div>
  </Teleport>
</template>

<style scoped>
/* ─── 容器与遮罩 ───────────────────────────────────────────────────────── */
.comment-drawer-wrapper {
  --drawer-width: clamp(340px, 28vw, 460px);
  --drawer-mask-edge: rgba(24, 32, 44, 0.06);
  --drawer-mask-panel: rgba(24, 32, 44, 0.24);
  --drawer-shadow: rgba(24, 32, 44, 0.12);
  position: relative;
  z-index: 3000;
  pointer-events: none;
}

:root[data-theme="dark"] .comment-drawer-wrapper {
  --drawer-mask-edge: rgba(0, 0, 0, 0.12);
  --drawer-mask-panel: rgba(0, 0, 0, 0.44);
  --drawer-shadow: rgba(0, 0, 0, 0.38);
}

.comment-drawer-wrapper.is-open {
  pointer-events: auto;
}

.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: linear-gradient(
    to left,
    var(--drawer-mask-panel) var(--drawer-width),
    var(--drawer-mask-edge)
  );
  z-index: 3000;
  pointer-events: auto;
}

.drawer-mask-fade-enter-active,
.drawer-mask-fade-leave-active {
  transition: opacity 0.28s ease;
}
.drawer-mask-fade-enter-from,
.drawer-mask-fade-leave-to {
  opacity: 0;
}
.drawer-mask-fade-leave-active {
  pointer-events: none;
}

/* ─── 抽屉侧边面板 ───────────────────────────────────────────────────── */
.drawer-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: var(--drawer-width);
  max-width: 100%;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  box-shadow: -8px 0 32px var(--drawer-shadow);
  z-index: 3001;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  visibility: hidden;
  transition: transform 0.28s cubic-bezier(0.2, 0.75, 0.3, 1), visibility 0s 0.28s;
  box-sizing: border-box;
  pointer-events: none;
  overscroll-behavior: contain;
  overscroll-behavior-y: contain;
}

.drawer-panel.panel-open {
  transform: translateX(0);
  visibility: visible;
  transition-delay: 0s;
  pointer-events: auto;
}

/* ─── 抽屉头部 ─────────────────────────────────────────────────────────── */
.drawer-header {
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.drawer-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.total-badge {
  font-size: 14px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* ─── 抽屉内容滚动体 ───────────────────────────────────────────────────── */
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  box-sizing: border-box;
  overscroll-behavior: contain;
  overscroll-behavior-y: contain;
}

.drawer-body::-webkit-scrollbar {
  width: 5px;
}
.drawer-body::-webkit-scrollbar-track {
  background: transparent;
}
.drawer-body::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.28);
  border-radius: 3px;
}
.drawer-body::-webkit-scrollbar-thumb:hover {
  background: rgba(120, 120, 120, 0.48);
}
:root[data-theme="dark"] .drawer-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
}
:root[data-theme="dark"] .drawer-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.38);
}

.drawer-status,
.drawer-empty {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.status-error {
  color: var(--danger-color);
}

.btn-retry {
  margin-top: 10px;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 12px;
  opacity: 0.5;
}

/* ─── 真正的纯圆头像（无方形背景底板，纯圆无毛刺） ─── */
.node-avatar,
.sub-avatar,
.third-avatar,
.footer-my-avatar {
  position: relative;
  border-radius: 50% !important;
  overflow: hidden !important;
  flex-shrink: 0;
  background: transparent !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.footer-my-avatar {
  width: 38px;
  height: 38px;
}

.sub-avatar {
  width: 26px;
  height: 26px;
}

.third-avatar {
  width: 24px;
  height: 24px;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 50% !important;
  background: transparent !important;
}

/* 没设置头像时的圆形字母头像 */
.avatar-letter {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111 !important;
  color: #ffffff !important;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  user-select: none;
  border-radius: 50% !important;
  overflow: hidden !important;
}

.sub-avatar .avatar-letter {
  font-size: 11px;
}

.third-avatar .avatar-letter {
  font-size: 10px;
}

/* 目标评论定位高亮脉冲动画 */
@keyframes comment-target-pulse {
  0% {
    background-color: rgba(59, 130, 246, 0.25);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }
  30% {
    background-color: rgba(59, 130, 246, 0.2);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.35);
  }
  100% {
    background-color: transparent;
    box-shadow: 0 0 0 0 transparent;
  }
}

:deep(.comment-highlight) {
  animation: comment-target-pulse 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
  border-radius: 8px;
}

/* ─── 评论列表项 ───────────────────────────────────────────────────────── */
.comment-items {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.comment-node {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.node-content {
  flex: 1;
  min-width: 0;
}

.node-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.node-author {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.node-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.node-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 6px;
}

.node-foot {
  display: flex;
  align-items: center;
  gap: 16px;
}

.node-btn {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: color 0.2s, transform 0.15s ease;
}

.node-btn:hover {
  color: var(--text-primary);
}

.node-btn:active {
  transform: scale(0.92);
}

.toggle-reply-btn {
  font-weight: 500;
  color: var(--text-secondary);
}

.toggle-reply-btn:hover {
  color: var(--text-primary);
}

.toggle-reply-btn:hover .toggle-line {
  width: 24px;
  background: var(--text-primary);
}

.toggle-line {
  display: inline-block;
  width: 18px;
  height: 1px;
  background: var(--border-color);
  margin-right: 2px;
  transition: width 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease;
}

.chevron-icon {
  transition: transform 0.25s ease;
}

.chevron-up {
  transform: rotate(180deg);
}

/* ─── 多级子回复树 ─────────────────────────────────────────────────────── */
.sub-tree {
  margin-top: 12px;
  padding-left: 14px;
  border-left: 2px solid var(--border-color);
}

.level-3-tree {
  margin-top: 8px;
  padding-left: 10px;
  border-left-color: rgba(120, 120, 120, 0.2);
}

.sub-loading {
  padding: 8px 0;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.sub-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sub-node {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.sub-main {
  flex: 1;
  min-width: 0;
}

.sub-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 2px;
}

.sub-author {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.reply-target-mention {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 1px 4px;
  border-radius: 3px;
}

.sub-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.sub-text {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.sub-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.sub-reply-btn {
  font-size: 11px;
}

.sub-toggle-btn {
  font-size: 11px;
}

.more-replies {
  margin-top: 4px;
}

.more-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.more-btn:hover {
  color: var(--text-primary);
  text-decoration: underline;
}

/* ─── 分页 ─────────────────────────────────────────────────────────────── */
.drawer-pagination {
  margin-top: 24px;
  padding-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.pg-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
}

.pg-btn:hover:not(:disabled) {
  border-color: var(--text-primary);
}

.pg-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pg-text {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ─── 抽屉底部常驻吸底输入栏 ───────────────────────────────────────────── */
.drawer-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}

.reply-bar-slide-enter-active,
.reply-bar-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.25, 0.64, 1);
}
.reply-bar-slide-enter-from,
.reply-bar-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.replying-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-hover);
  padding: 4px 10px;
  margin-bottom: 8px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  border-left: 2px solid var(--text-primary);
}

.cancel-reply-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
}

.cancel-reply-btn:hover {
  color: var(--text-primary);
}

.footer-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-wrapper {
  flex: 1;
}

.drawer-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 13px;
  padding: 8px 12px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  border-radius: 20px;
}

.drawer-input:focus {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px rgba(120, 120, 120, 0.1);
}

.drawer-send-btn {
  padding: 7px 16px;
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 18px;
  flex-shrink: 0;
  transition: all 0.2s;
}

.drawer-send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.drawer-send-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

/* ─── 弹窗与 Toast ─────────────────────────────────────────────────────── */
.drawer-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3100;
  backdrop-filter: blur(4px);
}

.drawer-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  width: 320px;
  padding: 22px;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
}

.modal-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.modal-title-row h4 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.modal-x {
  background: transparent;
  border: none;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
}

.modal-body-text {
  margin: 0 0 18px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-m-cancel {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}

.btn-m-login {
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid var(--text-primary);
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 4px;
}

.btn-m-danger {
  background: #ef4444;
  color: #fff;
  border: 1px solid #ef4444;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.btn-m-danger:hover:not(:disabled) {
  background: #dc2626;
  border-color: #dc2626;
}

.btn-m-danger:disabled {
  opacity: 0.6;
  cursor: wait;
}

.drawer-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background: var(--text-primary);
  color: var(--bg-primary);
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 13px;
  z-index: 3200;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.drawer-toast.toast-err {
  background: var(--danger-color);
  color: #fff;
}

.toast-pop-enter-active,
.toast-pop-leave-active {
  transition: all 0.25s ease;
}
.toast-pop-enter-from,
.toast-pop-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.spinner-small {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--text-secondary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .comment-drawer-wrapper {
    --drawer-width: 100%;
  }

  .drawer-panel {
    border-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer-panel,
  .drawer-mask-fade-enter-active,
  .drawer-mask-fade-leave-active {
    transition: none;
  }
}

/* ─── 评论树平滑展开与折叠动效 ───────────────────────────────────────── */
.tree-expand-enter-active {
  transition: all 0.38s cubic-bezier(0.34, 1.25, 0.64, 1);
  transform-origin: top left;
}

.tree-expand-leave-active {
  transition: all 0.25s ease-out;
  transform-origin: top left;
}

.tree-expand-enter-from,
.tree-expand-leave-to {
  opacity: 0;
  transform: translateY(-8px) scaleY(0.96);
}

.comment-node {
  animation: node-pop 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes node-pop {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
