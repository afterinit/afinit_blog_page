<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { commentApi } from '@/api/comment.js'
import { useUserInfo } from '@/composables/useUserInfo.js'
import { formatLocalTime } from '@/utils/timeFormat.js'
import { ROUTE_NAMES } from '@/constants/routes.js'

const props = defineProps({
  blogId: {
    type: [String, Number],
    required: true
  }
})

const emit = defineEmits(['comment-updated'])

const route = useRoute()
const router = useRouter()
const { userInfo, isLoggedIn, resolveAvatarUrl } = useUserInfo()
const avatarErrors = ref(new Set())

// ─── 状态定义 ──────────────────────────────────────────────────────────────────

// 根评论列表
const comments = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const totalPages = ref(1)
const loading = ref(false)
const listError = ref('')

// 主评论输入
const mainContent = ref('')
const submittingMain = ref(false)
const mainCharLimit = 1000

// 楼中楼回复状态
// activeReply = { rootCommentId, parentId, replyId, targetNickname }
const activeReply = ref(null)
const replyContent = ref('')
const submittingReply = ref(false)

// 登录拦截弹窗
const showLoginPrompt = ref(false)
const loginPromptMsg = ref('请先登录后再参与评论与互动')

// 悬浮轻提示 (Toast)
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

// ─── 用户头像辅助 ──────────────────────────────────────────────────────────────

function getAvatarLetter(name) {
  if (!name || typeof name !== 'string') return 'U'
  return name.trim().charAt(0).toUpperCase() || 'U'
}

// 根据用户名生成稳定的背景色阶
function getAvatarBg(name) {
  if (!name) return '#4f46e5'
  const colors = [
    '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', 
    '#10b981', '#f59e0b', '#06b6d4', '#14b8a6'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

// ─── 未登录拦截 ────────────────────────────────────────────────────────────────

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

// ─── 加载根评论 ────────────────────────────────────────────────────────────────

async function fetchRootComments(page = 1) {
  loading.value = true
  listError.value = ''
  try {
    const res = await commentApi.getComments({
      blogId: props.blogId,
      page,
      size: pageSize.value
    })
    
    const data = res?.data || {}
    const records = Array.isArray(data.records) ? data.records : []
    
    // 初始化每条根评论的子回复相关状态
    comments.value = records.map(item => ({
      ...item,
      id: String(item.id),
      parentId: item.parentId != null ? String(item.parentId) : null,
      replyId: item.replyId != null ? String(item.replyId) : null,
      replyCount: Number(item.replyCount || 0),
      // 子回复状态
      replies: [],
      repliesLoading: false,
      repliesLoaded: false,
      repliesExpanded: false,
      repliesPage: 1,
      repliesPages: 1,
      repliesTotal: 0
    }))
    
    currentPage.value = Number(data.current || page)
    totalPages.value = Number(data.pages || 1)
    total.value = Number(data.total || 0)
    emit('comment-updated', total.value)
  } catch (err) {
    listError.value = err.message || '加载评论失败，请重试'
  } finally {
    loading.value = false
  }
}

// ─── 分页切换 ──────────────────────────────────────────────────────────────────

function handlePageChange(newPage) {
  if (newPage < 1 || newPage > totalPages.value || newPage === currentPage.value) return
  fetchRootComments(newPage)
  // 滚动至评论区顶部
  const el = document.getElementById('comment-section')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// ─── 发表主评论 ────────────────────────────────────────────────────────────────

async function handleSubmitMain() {
  if (!checkLogin('发表评论')) return
  const content = mainContent.value.trim()
  if (!content) {
    showToast('评论内容不能为空', true)
    return
  }
  if (content.length > mainCharLimit) {
    showToast(`评论内容最多不能超过 ${mainCharLimit} 字`, true)
    return
  }

  submittingMain.value = true
  try {
    const res = await commentApi.sendComment({
      blogId: props.blogId,
      content
    })
    showToast(res.msg || '评论发表成功')
    mainContent.value = ''
    // 重新获取第 1 页评论
    await fetchRootComments(1)
  } catch (err) {
    showToast(err.message || '发表评论失败', true)
  } finally {
    submittingMain.value = false
  }
}

// ─── 子评论折叠与加载 ──────────────────────────────────────────────────────────

async function toggleReplies(rootComment) {
  // 如果当前已经展开，点击则收起
  if (rootComment.repliesExpanded) {
    rootComment.repliesExpanded = false
    return
  }

  // 展开并按需加载数据
  rootComment.repliesExpanded = true
  if (!rootComment.repliesLoaded) {
    await fetchReplies(rootComment, 1)
  }
}

async function fetchReplies(rootComment, page = 1) {
  rootComment.repliesLoading = true
  try {
    const res = await commentApi.getComments({
      blogId: props.blogId,
      parentId: rootComment.id,
      page,
      size: 10
    })

    const data = res?.data || {}
    const records = (Array.isArray(data.records) ? data.records : []).map(item => ({
      ...item,
      id: String(item.id),
      parentId: String(item.parentId),
      replyId: item.replyId != null ? String(item.replyId) : null
    }))

    if (page === 1) {
      rootComment.replies = records
    } else {
      // 追加下一页
      rootComment.replies = [...rootComment.replies, ...records]
    }

    rootComment.repliesPage = Number(data.current || page)
    rootComment.repliesPages = Number(data.pages || 1)
    rootComment.repliesTotal = Number(data.total || 0)
    rootComment.repliesLoaded = true
    // 同步最新的回复数
    if (rootComment.repliesTotal > rootComment.replyCount) {
      rootComment.replyCount = rootComment.repliesTotal
    }
  } catch (err) {
    showToast(err.message || '获取回复列表失败', true)
  } finally {
    rootComment.repliesLoading = false
  }
}

function loadMoreReplies(rootComment) {
  if (rootComment.repliesPage < rootComment.repliesPages && !rootComment.repliesLoading) {
    fetchReplies(rootComment, rootComment.repliesPage + 1)
  }
}

// 查找子回复被回复人昵称
function getRepliedNickname(rootComment, replyId) {
  if (!replyId) return null
  if (String(rootComment.id) === String(replyId)) {
    return rootComment.nickname
  }
  const match = rootComment.replies.find(r => String(r.id) === String(replyId))
  return match ? match.nickname : null
}

// ─── 打开/关闭回复框 ──────────────────────────────────────────────────────────

function openReply(rootComment, targetItem = null) {
  if (!checkLogin('回复他人')) return

  const isReplyingToSub = targetItem && String(targetItem.id) !== String(rootComment.id)
  
  // 如果点击的是同一个目标，则切换关闭
  if (
    activeReply.value &&
    activeReply.value.rootCommentId === rootComment.id &&
    activeReply.value.replyId === (isReplyingToSub ? targetItem.id : null)
  ) {
    closeReply()
    return
  }

  const targetUser = isReplyingToSub ? targetItem : rootComment
  activeReply.value = {
    rootCommentId: rootComment.id,
    parentId: rootComment.id,
    replyId: isReplyingToSub ? targetItem.id : rootComment.id,
    replyUserId: targetUser?.userId ? String(targetUser.userId) : null,
    targetNickname: isReplyingToSub ? targetItem.nickname : rootComment.nickname
  }
  replyContent.value = ''
}

function closeReply() {
  activeReply.value = null
  replyContent.value = ''
}

// ─── 提交回复 ──────────────────────────────────────────────────────────────────

async function handleSubmitReply(rootComment) {
  if (!checkLogin('发表回复')) return
  if (!activeReply.value) return

  const content = replyContent.value.trim()
  if (!content) {
    showToast('回复内容不能为空', true)
    return
  }
  if (content.length > mainCharLimit) {
    showToast(`回复内容最多不能超过 ${mainCharLimit} 字`, true)
    return
  }

  submittingReply.value = true
  try {
    const res = await commentApi.sendComment({
      blogId: props.blogId,
      parentId: activeReply.value.parentId,
      replyId: activeReply.value.replyId || undefined,
      replyUserId: activeReply.value.replyUserId || undefined,
      content
    })

    showToast(res.msg || '回复成功')
    closeReply()

    // 确保展开回复并刷新回复列表
    rootComment.repliesExpanded = true
    rootComment.replyCount = (rootComment.replyCount || 0) + 1
    await fetchReplies(rootComment, 1)
  } catch (err) {
    showToast(err.message || '回复失败', true)
  } finally {
    submittingReply.value = false
  }
}

// ─── 监听与生命周期 ────────────────────────────────────────────────────────────

watch(() => props.blogId, (newId) => {
  if (newId) {
    currentPage.value = 1
    fetchRootComments(1)
  }
}, { immediate: true })

onMounted(() => {
  if (props.blogId) {
    fetchRootComments(1)
  }
})
</script>

<template>
  <section id="comment-section" class="comment-section">
    <!-- 顶部标题与统计 -->
    <div class="comment-header">
      <h2 class="comment-title">
        评论 <span class="comment-count">({{ total }})</span>
      </h2>
    </div>

    <!-- 主评论发表输入框 -->
    <div class="comment-editor-card">
      <div class="editor-user-avatar">
        <img
          v-if="userInfo?.avatar && !avatarErrors.has('me')"
          :src="resolveAvatarUrl(userInfo.avatar)"
          class="avatar-img"
          alt="avatar"
          @error="avatarErrors.add('me')"
        />
        <div
          v-else
          class="avatar-fallback"
          :style="{ backgroundColor: getAvatarBg(userInfo?.nickname) }"
        >
          {{ getAvatarLetter(userInfo?.nickname) }}
        </div>
      </div>
      <div class="editor-main">
        <textarea
          class="comment-textarea"
          v-model="mainContent"
          :placeholder="isLoggedIn ? '写下你的评论，参与探讨...' : '登录后发表评论...'"
          :maxlength="mainCharLimit"
          rows="3"
          @focus="!isLoggedIn && checkLogin('发表评论')"
        ></textarea>
        <div class="editor-footer">
          <span class="char-count" :class="{ 'char-count-warn': mainContent.length >= mainCharLimit * 0.9 }">
            {{ mainContent.length }} / {{ mainCharLimit }}
          </span>
          <button
            type="button"
            class="btn-submit"
            :disabled="submittingMain || !mainContent.trim()"
            @click="handleSubmitMain"
          >
            <span v-if="!submittingMain">发表评论</span>
            <span v-else class="btn-spinner"></span>
          </button>
        </div>
      </div>
    </div>

    <!-- 列表加载状态 -->
    <div v-if="loading && comments.length === 0" class="comment-status">
      <span class="spinner-small"></span>
      <span>正在加载评论...</span>
    </div>

    <!-- 列表加载失败 -->
    <div v-else-if="listError" class="comment-status status-error">
      <p>{{ listError }}</p>
      <button class="btn-retry" @click="fetchRootComments(currentPage)">点击重试</button>
    </div>

    <!-- 暂无评论 -->
    <div v-else-if="comments.length === 0" class="comment-empty">
      <div class="empty-icon">💬</div>
      <p>暂无评论，快来发表第一条评论吧！</p>
    </div>

    <!-- 评论列表 -->
    <div v-else class="comment-list">
      <article
        v-for="item in comments"
        :key="item.id"
        class="comment-item"
      >
        <!-- 根评论头像 -->
        <div class="comment-avatar">
          <img
            v-if="item.avatar && !avatarErrors.has(item.id)"
            :src="resolveAvatarUrl(item.avatar)"
            class="avatar-img"
            :alt="item.nickname || 'avatar'"
            @error="avatarErrors.add(item.id)"
          />
          <div
            v-else
            class="avatar-fallback"
            :style="{ backgroundColor: getAvatarBg(item.nickname) }"
          >
            {{ getAvatarLetter(item.nickname) }}
          </div>
        </div>

        <!-- 根评论内容主体 -->
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-author">{{ item.nickname || '匿名用户' }}</span>
            <span class="comment-time">{{ formatLocalTime(item.createTime) }}</span>
          </div>

          <div class="comment-content">
            {{ item.content }}
          </div>

          <!-- 根评论操作栏 -->
          <div class="comment-actions">
            <button
              type="button"
              class="action-btn"
              @click="openReply(item)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>{{ activeReply?.rootCommentId === item.id && !activeReply?.replyId ? '取消回复' : '回复' }}</span>
            </button>

            <!-- 折叠/展开子评论切换按钮 -->
            <button
              v-if="item.replyCount > 0"
              type="button"
              class="action-btn reply-toggle-btn"
              @click="toggleReplies(item)"
            >
              <span>{{ item.repliesExpanded ? '收起回复' : `查看回复 (${item.replyCount})` }}</span>
              <svg
                class="arrow-icon"
                :class="{ 'arrow-up': item.repliesExpanded }"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>

          <!-- 回复根评论的输入框（内嵌） -->
          <div
            v-if="activeReply?.rootCommentId === item.id && !activeReply?.replyId"
            class="reply-editor-box"
          >
            <div class="reply-target-tag">
              <span>回复 @{{ activeReply.targetNickname }}</span>
              <button type="button" class="tag-close-btn" @click="closeReply">×</button>
            </div>
            <textarea
              class="reply-textarea"
              v-model="replyContent"
              :placeholder="`回复 @${activeReply.targetNickname}...`"
              rows="2"
              :maxlength="mainCharLimit"
              autofocus
            ></textarea>
            <div class="reply-editor-footer">
              <button type="button" class="btn-cancel" @click="closeReply">取消</button>
              <button
                type="button"
                class="btn-reply-submit"
                :disabled="submittingReply || !replyContent.trim()"
                @click="handleSubmitReply(item)"
              >
                <span v-if="!submittingReply">发送</span>
                <span v-else class="btn-spinner"></span>
              </button>
            </div>
          </div>

          <!-- ─── 子回复列表（楼中楼） ───────────────────────────────────── -->
          <div
            v-if="item.repliesExpanded"
            class="sub-reply-section"
          >
            <div v-if="item.repliesLoading && item.replies.length === 0" class="sub-reply-loading">
              <span class="spinner-small"></span>
              <span>加载回复中...</span>
            </div>

            <div v-else class="sub-reply-list">
              <div
                v-for="sub in item.replies"
                :key="sub.id"
                class="sub-reply-item"
              >
                <div class="sub-avatar">
                  <img
                    v-if="sub.avatar && !avatarErrors.has(sub.id)"
                    :src="resolveAvatarUrl(sub.avatar)"
                    class="avatar-img"
                    :alt="sub.nickname || 'avatar'"
                    @error="avatarErrors.add(sub.id)"
                  />
                  <div
                    v-else
                    class="avatar-fallback"
                    :style="{ backgroundColor: getAvatarBg(sub.nickname) }"
                  >
                    {{ getAvatarLetter(sub.nickname) }}
                  </div>
                </div>
                <div class="sub-content-wrap">
                  <div class="sub-meta">
                    <span class="sub-author">{{ sub.nickname || '匿名用户' }}</span>
                    <!-- 若为回复某人，显示被回复目标 -->
                    <span v-if="getRepliedNickname(item, sub.replyId)" class="reply-to">
                      回复 <span class="reply-to-name">@{{ getRepliedNickname(item, sub.replyId) }}</span>
                    </span>
                    <span class="sub-time">{{ formatLocalTime(sub.createTime) }}</span>
                  </div>
                  <div class="sub-text">
                    {{ sub.content }}
                  </div>
                  <div class="sub-actions">
                    <button
                      type="button"
                      class="sub-action-btn"
                      @click="openReply(item, sub)"
                    >
                      {{ activeReply?.replyId === sub.id ? '取消回复' : '回复' }}
                    </button>
                  </div>

                  <!-- 回复该子评论的内嵌输入框 -->
                  <div
                    v-if="activeReply?.rootCommentId === item.id && activeReply?.replyId === sub.id"
                    class="reply-editor-box nested-reply-editor"
                  >
                    <div class="reply-target-tag">
                      <span>回复 @{{ activeReply.targetNickname }}</span>
                      <button type="button" class="tag-close-btn" @click="closeReply">×</button>
                    </div>
                    <textarea
                      class="reply-textarea"
                      v-model="replyContent"
                      :placeholder="`回复 @${activeReply.targetNickname}...`"
                      rows="2"
                      :maxlength="mainCharLimit"
                      autofocus
                    ></textarea>
                    <div class="reply-editor-footer">
                      <button type="button" class="btn-cancel" @click="closeReply">取消</button>
                      <button
                        type="button"
                        class="btn-reply-submit"
                        :disabled="submittingReply || !replyContent.trim()"
                        @click="handleSubmitReply(item)"
                      >
                        <span v-if="!submittingReply">发送</span>
                        <span v-else class="btn-spinner"></span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 加载更多子回复 -->
              <div v-if="item.repliesPage < item.repliesPages" class="sub-load-more">
                <button
                  type="button"
                  class="load-more-btn"
                  :disabled="item.repliesLoading"
                  @click="loadMoreReplies(item)"
                >
                  <span v-if="item.repliesLoading" class="spinner-small"></span>
                  <span>展开更多回复 (还剩 {{ item.repliesTotal - item.replies.length }} 条)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- ─── 根评论分页控制器 ────────────────────────────────────────── -->
      <nav v-if="totalPages > 1" class="comment-pagination" aria-label="评论分页">
        <button
          type="button"
          class="page-btn page-btn-prev"
          :disabled="currentPage <= 1 || loading"
          @click="handlePageChange(currentPage - 1)"
        >
          上一页
        </button>

        <span class="page-info">
          第 {{ currentPage }} / {{ totalPages }} 页
        </span>

        <button
          type="button"
          class="page-btn page-btn-next"
          :disabled="currentPage >= totalPages || loading"
          @click="handlePageChange(currentPage + 1)"
        >
          下一页
        </button>
      </nav>
    </div>

    <!-- ─── 登录拦截提示弹窗 ──────────────────────────────────────────── -->
    <div v-if="showLoginPrompt" class="modal-backdrop" @click="showLoginPrompt = false">
      <div class="login-modal" @click.stop>
        <div class="modal-header">
          <h3>需要登录</h3>
          <button type="button" class="modal-close-icon" @click="showLoginPrompt = false">×</button>
        </div>
        <p class="modal-desc">{{ loginPromptMsg }}</p>
        <div class="modal-actions">
          <button type="button" class="btn-modal-cancel" @click="showLoginPrompt = false">稍后再说</button>
          <button type="button" class="btn-modal-confirm" @click="goToLogin">立即登录</button>
        </div>
      </div>
    </div>

    <!-- ─── 悬浮 Toast 提示 ────────────────────────────────────────────── -->
    <transition name="toast-slide">
      <div
        v-if="toastMessage"
        class="comment-toast"
        :class="{ 'toast-error': toastIsError }"
      >
        {{ toastMessage }}
      </div>
    </transition>
  </section>
</template>

<style scoped>
/* ─── 容器与基础 ───────────────────────────────────────────────────────── */
.comment-section {
  margin-top: 56px;
  padding-top: 36px;
  border-top: 1px solid var(--border-color);
  font-family: var(--font-sans);
  color: var(--text-primary);
  position: relative;
}

.comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.comment-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.comment-count {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* ─── 主评论输入卡片 ─────────────────────────────────────────────────── */
.comment-editor-card {
  display: flex;
  gap: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 20px;
  margin-bottom: 36px;
  transition: border-color 0.2s ease;
}

.comment-editor-card:focus-within {
  border-color: var(--text-primary);
}

.editor-user-avatar,
.comment-avatar,
.sub-avatar {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 15px;
  flex-shrink: 0;
  user-select: none;
  overflow: hidden;
  background: var(--bg-hover);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.sub-avatar {
  width: 30px;
  height: 30px;
  font-size: 12px;
}

.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment-textarea,
.reply-textarea {
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  resize: vertical;
  min-height: 72px;
}

.comment-textarea::placeholder,
.reply-textarea::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.char-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.char-count-warn {
  color: var(--danger-color);
}

.btn-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 18px;
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-submit:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ─── 状态展示 ───────────────────────────────────────────────────────── */
.comment-status,
.comment-empty {
  text-align: center;
  padding: 48px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.status-error {
  color: var(--danger-color);
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 12px;
  opacity: 0.6;
}

.btn-retry {
  margin-top: 12px;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}

.btn-retry:hover {
  background: var(--bg-hover);
}

/* ─── 评论列表项 ─────────────────────────────────────────────────────── */
.comment-list {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.comment-item {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.comment-body {
  flex: 1;
  min-width: 0;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.comment-author {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.comment-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.comment-content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 10px;
}

/* ─── 操作按钮 ───────────────────────────────────────────────────────── */
.comment-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 6px;
  transition: color 0.2s ease;
}

.action-btn:hover {
  color: var(--text-primary);
}

.reply-toggle-btn {
  font-weight: 500;
  color: var(--text-secondary);
}

.arrow-icon {
  transition: transform 0.25s ease;
}

.arrow-up {
  transform: rotate(180deg);
}

/* ─── 内嵌回复编辑器 ─────────────────────────────────────────────────── */
.reply-editor-box {
  margin-top: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 14px;
}

.reply-target-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 3px 8px;
  margin-bottom: 8px;
}

.tag-close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}

.tag-close-btn:hover {
  color: var(--text-primary);
}

.reply-textarea {
  min-height: 56px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
  margin-bottom: 10px;
}

.reply-editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  color: var(--text-primary);
  border-color: var(--text-primary);
}

.btn-reply-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid var(--text-primary);
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-reply-submit:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-reply-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ─── 楼中楼子回复区 ─────────────────────────────────────────────────── */
.sub-reply-section {
  margin-top: 14px;
  padding-left: 16px;
  border-left: 2px solid var(--border-color);
}

.sub-reply-loading {
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-reply-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sub-reply-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.sub-content-wrap {
  flex: 1;
  min-width: 0;
}

.sub-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.sub-author {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.reply-to {
  font-size: 12px;
  color: var(--text-secondary);
}

.reply-to-name {
  color: var(--text-primary);
  font-weight: 500;
}

.sub-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.sub-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.sub-actions {
  margin-top: 4px;
}

.sub-action-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
}

.sub-action-btn:hover {
  color: var(--text-primary);
}

.nested-reply-editor {
  margin-top: 10px;
}

.sub-load-more {
  margin-top: 6px;
}

.load-more-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.load-more-btn:hover:not(:disabled) {
  color: var(--text-primary);
  text-decoration: underline;
}

/* ─── 分页控制器 ─────────────────────────────────────────────────────── */
.comment-pagination {
  margin-top: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  font-size: 13px;
}

.page-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--text-primary);
  background: var(--bg-hover);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ─── 弹窗与遮罩 ─────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.login-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  width: 90%;
  max-width: 380px;
  padding: 28px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
  animation: modal-enter 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modal-enter {
  0% { transform: scale(0.94); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close-icon {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.modal-desc {
  margin: 0 0 24px 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-modal-cancel {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 7px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-modal-cancel:hover {
  color: var(--text-primary);
  border-color: var(--text-primary);
}

.btn-modal-confirm {
  background: var(--text-primary);
  color: var(--bg-primary);
  border: 1px solid var(--text-primary);
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-modal-confirm:hover {
  background: var(--accent-hover);
}

/* ─── 悬浮 Toast ─────────────────────────────────────────────────────── */
.comment-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text-primary);
  color: var(--bg-primary);
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 1100;
  pointer-events: none;
}

.comment-toast.toast-error {
  background: var(--danger-color);
  color: #ffffff;
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

/* ─── 旋转 Spinner ────────────────────────────────────────────────────── */
.btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
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

/* ─── 移动端适配 ─────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .comment-editor-card {
    padding: 14px;
    gap: 12px;
  }
  .editor-user-avatar {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }
  .comment-avatar {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }
  .sub-reply-section {
    padding-left: 10px;
  }
}
</style>
