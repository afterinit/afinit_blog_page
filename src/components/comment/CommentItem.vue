<script setup>
import { computed } from 'vue'
import { useUserInfo } from '@/composables/useUserInfo.js'

defineOptions({
  name: 'CommentItem'
})

const props = defineProps({
  comment: {
    type: Object,
    required: true
  },
  avatarErrors: {
    type: Object,
    required: true
  },
  resolveAvatarUrl: {
    type: Function,
    required: true
  },
  getAvatarLetter: {
    type: Function,
    required: true
  },
  formatLocalTime: {
    type: Function,
    required: true
  }
})

const emit = defineEmits(['reply', 'delete', 'toggle-replies', 'load-more-replies', 'jump-to-reply'])

const { userInfo } = useUserInfo()

/**
 * 判断当前登录用户是否具有删除该评论的权限（管理员 或 评论作者本人）
 */
function canDelete(targetComment) {
  if (!userInfo.value || !targetComment) return false
  const currentUserId = String(userInfo.value.id || userInfo.value.userId || '')
  const commentUserId = String(targetComment.userId || '')
  const isAuthor = Boolean(currentUserId && commentUserId && currentUserId === commentUserId)
  const isAdmin = userInfo.value.role === 1 || userInfo.value.role === '1'
  return isAuthor || isAdmin
}

/**
 * 根评论下的回复总数
 */
const count = computed(() => {
  const c = props.comment?.replyCount !== undefined
    ? props.comment.replyCount
    : (props.comment?.count !== undefined ? props.comment.count : 0)
  return Number(c) || 0
})

/**
 * 是否有回复可供展开
 */
const canExpand = computed(() => count.value > 0)
</script>

<template>
  <article class="comment-item-node">
    <!-- ─── 根评论（一级评论） ─── -->
    <div :id="'comment-node-' + comment.id" class="root-comment-row">
      <!-- 纯圆头像 -->
      <div class="node-avatar root-avatar user-avatar">
        <img
          v-if="comment.avatar && !avatarErrors.has(comment.id)"
          :src="resolveAvatarUrl(comment.avatar)"
          class="avatar-img user-avatar"
          :alt="comment.nickname || 'avatar'"
          @error="avatarErrors.add(comment.id)"
        />
        <div v-else class="avatar-letter user-avatar">
          {{ getAvatarLetter(comment.nickname) }}
        </div>
      </div>

      <!-- 评论主体信息 -->
      <div class="root-content">
        <div class="node-top">
          <span class="node-author">{{ comment.nickname || '匿名用户' }}</span>
          <span class="node-time">{{ formatLocalTime(comment.createTime) }}</span>
        </div>

        <div class="node-text">{{ comment.content }}</div>

        <!-- 根评论操作栏 -->
        <div class="node-foot">
          <button
            type="button"
            class="node-btn reply-btn"
            @click="emit('reply', comment, comment)"
          >
            回复
          </button>

          <!-- 删除按钮（管理员或评论本人可见） -->
          <button
            v-if="canDelete(comment)"
            type="button"
            class="node-btn delete-btn"
            @click="emit('delete', comment, comment)"
          >
            删除
          </button>

          <!-- 展开 / 收起二级回复 -->
          <button
            v-if="canExpand"
            type="button"
            class="node-btn toggle-reply-btn"
            @click="emit('toggle-replies', comment)"
          >
            <span class="toggle-line"></span>
            <span>{{ comment.repliesExpanded ? '收起' : `展开 ${count} 条回复` }}</span>
            <svg
              class="chevron-icon"
              :class="{ 'chevron-up': comment.repliesExpanded }"
              width="11"
              height="11"
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
      </div>
    </div>

    <!-- ─── 二级回复区域（扁平列表） ─── -->
    <transition name="replies-expand">
      <div v-if="comment.repliesExpanded" class="sub-replies-wrap">
        <!-- 加载动画 -->
        <div
          v-if="comment.repliesLoading && (!comment.replies || comment.replies.length === 0)"
          class="sub-loading"
        >
          <span class="spinner-small"></span>
          <span>正在加载回复...</span>
        </div>

        <!-- 二级回复列表 -->
        <div v-else class="sub-replies-list">
          <div
            v-for="reply in comment.replies"
            :key="reply.id"
            :id="'comment-node-' + reply.id"
            class="sub-reply-item"
          >
            <!-- 二级小头像 -->
            <div class="node-avatar sub-avatar user-avatar">
              <img
                v-if="reply.avatar && !avatarErrors.has(reply.id)"
                :src="resolveAvatarUrl(reply.avatar)"
                class="avatar-img user-avatar"
                :alt="reply.nickname || 'avatar'"
                @error="avatarErrors.add(reply.id)"
              />
              <div v-else class="avatar-letter user-avatar">
                {{ getAvatarLetter(reply.nickname) }}
              </div>
            </div>

            <!-- 回复内容与操作 -->
            <div class="sub-reply-content">
              <div class="sub-reply-top">
                <span class="sub-reply-author">{{ reply.nickname || '匿名用户' }}</span>
                <!-- 楼中楼回复指向谁：点击 @用户 可平滑跳转并高亮该条评论 -->
                <span v-if="reply.replyNickname" class="reply-target-tag">
                  回复
                  <span
                    class="mention-user"
                    :title="reply.replyId ? `跳转到 @${reply.replyNickname} 的评论` : ''"
                    @click.stop="emit('jump-to-reply', reply.replyId, comment)"
                  >
                    @{{ reply.replyNickname }}
                  </span>
                </span>
                <span class="sub-reply-time">{{ formatLocalTime(reply.createTime) }}</span>
              </div>

              <div class="sub-reply-text">{{ reply.content }}</div>

              <div class="sub-reply-foot">
                <button
                  type="button"
                  class="node-btn sub-reply-btn"
                  @click="emit('reply', reply, comment)"
                >
                  回复
                </button>

                <!-- 删除按钮（管理员或评论本人可见） -->
                <button
                  v-if="canDelete(reply)"
                  type="button"
                  class="node-btn sub-reply-btn delete-btn"
                  @click="emit('delete', reply, comment)"
                >
                  删除
                </button>
              </div>
            </div>
          </div>

          <!-- 分页展开更多 -->
          <div
            v-if="comment.repliesPage < comment.repliesPages"
            class="more-replies"
          >
            <button
              type="button"
              class="more-btn"
              :disabled="comment.repliesLoading"
              @click="emit('load-more-replies', comment)"
            >
              <span v-if="comment.repliesLoading" class="spinner-small"></span>
              <span>展开更多回复 (剩余 {{ comment.repliesTotal - (comment.replies?.length || 0) }} 条)</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </article>
</template>

<style scoped>
.comment-item-node {
  animation: node-pop 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
  margin-bottom: 22px;
}

/* ─── 根评论主体行 ─────────────────────────────────────────────── */
.root-comment-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

/* ─── 真正的纯圆头像（无方形背景底板，纯圆无毛刺） ─── */
.node-avatar {
  position: relative;
  border-radius: 50% !important;
  overflow: hidden !important;
  flex-shrink: 0;
  background: transparent !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.root-avatar {
  width: 38px;
  height: 38px;
}

.sub-avatar {
  width: 26px;
  height: 26px;
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

/* ─── 根评论内容 ───────────────────────────────────────────────── */
.root-content {
  flex: 1;
  min-width: 0;
}

.node-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.node-author {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.node-time {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.8;
}

.node-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  margin-bottom: 8px;
  word-break: break-word;
  white-space: pre-wrap;
}

/* ─── 底部操作按钮 ─────────────────────────────────────────────── */
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

.node-btn.delete-btn {
  color: var(--text-secondary);
  opacity: 0.75;
}

.node-btn.delete-btn:hover {
  color: #ef4444;
  opacity: 1;
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

/* ─── 二级回复区域（扁平列表容器） ────────────────────────────── */
.sub-replies-wrap {
  margin-left: 50px;
  margin-top: 10px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--bg-hover) 75%, transparent);
  border-radius: 8px;
  border-left: 2.5px solid rgba(99, 140, 255, 0.45);
}

.sub-loading {
  padding: 6px 0;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.sub-replies-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sub-reply-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sub-reply-content {
  flex: 1;
  min-width: 0;
}

.sub-reply-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 2px;
}

.sub-reply-author {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.reply-target-tag {
  font-size: 12px;
  color: var(--text-secondary);
}

.mention-user {
  color: #3b82f6;
  font-weight: 500;
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 4px;
  transition: all 0.18s ease;
  display: inline-block;
}

.mention-user:hover {
  color: #1d4ed8;
  background-color: rgba(59, 130, 246, 0.12);
  text-decoration: underline;
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

.comment-highlight {
  animation: comment-target-pulse 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
  border-radius: 8px;
}

.sub-reply-time {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.8;
  margin-left: auto;
}

.sub-reply-text {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-primary);
  margin-bottom: 4px;
  word-break: break-word;
  white-space: pre-wrap;
}

.sub-reply-foot {
  display: flex;
  align-items: center;
  gap: 14px;
}

.sub-reply-btn {
  font-size: 11px;
}

/* ─── 展开更多回复按钮 ─────────────────────────────────────────── */
.more-replies {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed rgba(120, 120, 120, 0.15);
}

.more-btn {
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  transition: color 0.2s;
}

.more-btn:hover:not(:disabled) {
  color: var(--text-primary);
}

.more-btn:disabled {
  opacity: 0.6;
  cursor: wait;
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

/* ─── 展开过渡动效 ─────────────────────────────────────────────── */
.replies-expand-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top;
}

.replies-expand-leave-active {
  transition: all 0.2s ease-out;
  transform-origin: top;
}

.replies-expand-enter-from,
.replies-expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
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
