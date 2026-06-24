<script setup>
/**
 * AvatarUpload.vue
 *
 * 头像上传组件。
 *
 * Props:
 *   avatarUrl {string|null} — 当前头像 URL，为 null 时显示昵称首字母占位
 *   nickname  {string}      — 用于占位字母生成
 *
 * Emits:
 *   update:avatarUrl {string} — 上传成功后将新 URL 通知父组件（v-model 兼容）
 *   error            {string} — 任意阶段发生错误时对外通知错误信息
 *
 * 依赖:
 *   compressorjs   — npm install compressorjs
 *   request.js     — 项目封装的 axios 实例（已含 Authorization 拦截器）
 *   apiResponse.js — getApiMessage()
 */

import { ref, computed } from 'vue'
import Compressor from 'compressorjs'
import request, { syncTokenAfterAvatarUpload } from '../utils/request.js'
import { getApiMessage } from '../utils/apiResponse.js'

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const API_BASE      = import.meta.env.VITE_API_BASE_URL
const MAX_FILE_SIZE = 5 * 1024 * 1024   // 5 MB
const COMPRESS_OPTS = { quality: 0.6, maxWidth: 800 }

// ─── Props / Emits ─────────────────────────────────────────────────────────────

const props = defineProps({
  avatarUrl: {
    type: String,
    default: null,
  },
  nickname: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:avatarUrl', 'error'])

// ─── 响应式状态 ────────────────────────────────────────────────────────────────

/** 上传流程中显示的本地预览 URL（Object URL），成功后替换为后端 URL */
const previewUrl = ref(props.avatarUrl)
const uploading  = ref(false)
const errorMsg   = ref('')

/** 隐藏的 file input ref */
const fileInputRef = ref(null)

// ─── 计算属性 ──────────────────────────────────────────────────────────────────

/** 当 previewUrl 为空时，用昵称首字母做占位 */
const avatarLetter = computed(() => {
  const name = props.nickname ?? ''
  return name.charAt(0).toUpperCase() || 'U'
})

// ─── 核心流程 ──────────────────────────────────────────────────────────────────

/** 点击头像区域 → 触发隐藏的 input */
function triggerFilePicker() {
  if (uploading.value) return
  fileInputRef.value?.click()
}

/**
 * 用户选中文件的入口。
 * 顺序：大小校验 → 压缩 → 上传
 */
function onFileChange(event) {
  const file = event.target.files?.[0]
  // 清空 input，保证同一文件再次选中也能触发
  event.target.value = ''

  if (!file) return

  // ── 第一道防线：文件大小校验 ──────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    setError('图片大小不能超过 5MB，请重新选择')
    return
  }

  clearError()
  compress(file)
}

/**
 * 使用 compressorjs 对图片进行压缩。
 * 压缩是异步的，通过 success / error 回调驱动后续流程。
 *
 * @param {File} file - 原始文件
 */
function compress(file) {
  uploading.value = true

  // 立刻生成本地预览，提升体验感
  previewUrl.value = URL.createObjectURL(file)

  new Compressor(file, {
    ...COMPRESS_OPTS,
    success(compressedBlob) {
      upload(compressedBlob)
    },
    error(err) {
      uploading.value = false
      setError(`图片压缩失败：${err.message}`)
    },
  })
}

/**
 * 将压缩后的 Blob 上传到后端。
 * request.js 的拦截器已自动注入 Authorization header，此处无需手动处理。
 *
 * @param {Blob} blob - 压缩后的图片 Blob
 */
async function upload(blob) {
  const formData = new FormData()
  formData.append('file', blob, 'avatar.jpg')
  const uploadStartedAt = Date.now()

  try {
    const response = await request(`${API_BASE}/user/avatar`, {
      method: 'POST',
      skipAuthRedirect: true,
      // Content-Type 由浏览器自动设置（含 boundary），不能手动覆盖
      body: formData,
    })
    const res = await response.json()

    // 后端统一返回体，data 为新头像 URL 字符串
    if (!response.ok || typeof res?.data !== 'string') {
      throw new Error(getApiMessage(res, '上传失败，请重试'))
    }

    // 先同步凭证再通知父组件，避免 fetchUserInfo 带着被后端作废的旧 token
    try {
      await syncTokenAfterAvatarUpload(uploadStartedAt)
    } catch {
      // 上传已成功；后续请求会走 401 拦截器 refresh
    }

    previewUrl.value = res.data
    emit('update:avatarUrl', res.data)
  } catch (err) {
    // 恢复成上传前的头像，不留坏掉的 Object URL
    previewUrl.value = props.avatarUrl
    setError(err.message || '上传失败，请稍后重试')
  } finally {
    uploading.value = false
  }
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function setError(msg) {
  errorMsg.value = msg
  emit('error', msg)
}

function clearError() {
  errorMsg.value = ''
}
</script>

<template>
  <div class="avatar-upload">

    <!-- 可点击的头像区域 -->
    <div
      class="avatar-trigger"
      :class="{ 'is-uploading': uploading }"
      :title="uploading ? '上传中…' : '点击更换头像'"
      @click="triggerFilePicker"
    >
      <!-- 头像图片 -->
      <img
        v-if="previewUrl"
        :src="previewUrl"
        alt="头像"
        class="avatar-img"
      />

      <!-- 无头像时的字母占位 -->
      <span v-else class="avatar-letter">{{ avatarLetter }}</span>

      <!-- 上传中的遮罩层 -->
      <Transition name="overlay-fade">
        <div v-if="uploading" class="upload-overlay">
          <div class="spinner"></div>
        </div>
      </Transition>

      <!-- 正常状态的悬浮编辑提示 -->
      <div v-if="!uploading" class="edit-hint">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M9.5 2.5L11.5 4.5L4.5 11.5H2.5V9.5L9.5 2.5Z"
            stroke="currentColor" stroke-width="1.2"
            stroke-linecap="round" stroke-linejoin="round"
          />
        </svg>
      </div>
    </div>

    <!-- 错误提示 -->
    <Transition name="err-slide">
      <p v-if="errorMsg" class="error-msg" role="alert">{{ errorMsg }}</p>
    </Transition>

    <!-- 隐藏的 file input，只接受图片 -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="hidden-input"
      @change="onFileChange"
    />
  </div>
</template>

<style scoped>
/* ── 组件根节点 ───────────────────────────────────────────────────────────── */
.avatar-upload {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

/* ── 可点击的头像区域 ─────────────────────────────────────────────────────── */
.avatar-trigger {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  background: #111;
  /* 圆形轮廓，鼠标悬浮时微微放大 */
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.avatar-trigger:hover {
  transform: scale(1.04);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

/* 上传中禁止缩放，给出明确的等待反馈 */
.avatar-trigger.is-uploading {
  cursor: wait;
  transform: none;
}

/* ── 头像图片 & 字母占位 ──────────────────────────────────────────────────── */
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-letter {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32px;
  font-weight: 600;
  line-height: 1;
  user-select: none;
}

/* ── 上传中遮罩 ───────────────────────────────────────────────────────────── */
.upload-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── 悬浮编辑提示（铅笔图标） ─────────────────────────────────────────────── */
.edit-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  color: #fff;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.avatar-trigger:hover .edit-hint {
  opacity: 1;
}

/* ── 错误提示 ─────────────────────────────────────────────────────────────── */
.error-msg {
  margin: 0;
  font-size: 12px;
  color: #d32f2f;
  text-align: center;
  max-width: 180px;
  line-height: 1.4;
}

/* ── 隐藏的 input ─────────────────────────────────────────────────────────── */
.hidden-input {
  display: none;
}

/* ── 动画 ─────────────────────────────────────────────────────────────────── */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.err-slide-enter-active,
.err-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.err-slide-enter-from,
.err-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
