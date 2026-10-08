<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { syncTokenAfterAvatarUpload } from '../utils/request.js'
import { userApi } from '../api/user.js'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const OUTPUT_SIZE = 640
const MAX_ZOOM = 4

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

const previewUrl = ref(props.avatarUrl)
const uploading = ref(false)
const errorMsg = ref('')
const fileInputRef = ref(null)

const cropDialogRef = ref(null)
const cropViewportRef = ref(null)
const cropImageRef = ref(null)
const cropDialogOpen = ref(false)
const cropSourceUrl = ref('')
const localPreviewUrl = ref('')
const imageReady = ref(false)
const processingCrop = ref(false)
const imageNaturalWidth = ref(0)
const imageNaturalHeight = ref(0)
const viewportSize = ref(0)
const baseScale = ref(1)
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

const activePointers = new Map()
let lastPointerPosition = null
let pinchStart = null
let resizeObserver = null
let bodyOverflowBeforeCrop = ''

const avatarLetter = computed(() => {
  const name = props.nickname ?? ''
  return name.charAt(0).toUpperCase() || 'U'
})

const cropImageStyle = computed(() => ({
  width: `${imageNaturalWidth.value * baseScale.value * zoom.value}px`,
  height: `${imageNaturalHeight.value * baseScale.value * zoom.value}px`,
  left: `${(viewportSize.value - imageNaturalWidth.value * baseScale.value * zoom.value) / 2 + offsetX.value}px`,
  top: `${(viewportSize.value - imageNaturalHeight.value * baseScale.value * zoom.value) / 2 + offsetY.value}px`,
}))

watch(
  () => props.avatarUrl,
  (value) => {
    if (!uploading.value && !cropDialogOpen.value) previewUrl.value = value
  },
)

function triggerFilePicker() {
  if (uploading.value) return
  fileInputRef.value?.click()
}

function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''

  if (!file) return
  if (!file.type.startsWith('image/')) {
    setError('请选择图片文件')
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    setError('图片大小不能超过 5MB，请重新选择')
    return
  }

  clearError()
  openCropper(file)
}

async function openCropper(file) {
  revokeObjectUrl(cropSourceUrl.value)
  cropSourceUrl.value = URL.createObjectURL(file)
  imageReady.value = false
  zoom.value = 1
  offsetX.value = 0
  offsetY.value = 0
  cropDialogOpen.value = true
  bodyOverflowBeforeCrop = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  await nextTick()
  cropDialogRef.value?.focus()
  startResizeObserver()
}

function closeCropper() {
  if (processingCrop.value) return

  stopResizeObserver()
  cropDialogOpen.value = false
  imageReady.value = false
  activePointers.clear()
  lastPointerPosition = null
  pinchStart = null
  document.body.style.overflow = bodyOverflowBeforeCrop
  revokeObjectUrl(cropSourceUrl.value)
  cropSourceUrl.value = ''
}

function onCropImageLoad() {
  const image = cropImageRef.value
  if (!image) return

  imageNaturalWidth.value = image.naturalWidth
  imageNaturalHeight.value = image.naturalHeight
  imageReady.value = true
  measureViewport(true)
}

function onCropImageError() {
  setError('无法读取这张图片，请换一张常见格式的图片')
  closeCropper()
}

function startResizeObserver() {
  stopResizeObserver()
  if (!cropViewportRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => measureViewport(false))
  resizeObserver.observe(cropViewportRef.value)
}

function stopResizeObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
}

function measureViewport(resetPosition = false) {
  if (!imageReady.value || !cropViewportRef.value) return

  const nextSize = cropViewportRef.value.getBoundingClientRect().width
  if (!nextSize) return

  const oldSize = viewportSize.value
  viewportSize.value = nextSize
  baseScale.value = Math.max(
    nextSize / imageNaturalWidth.value,
    nextSize / imageNaturalHeight.value,
  )

  if (resetPosition || !oldSize) {
    zoom.value = 1
    offsetX.value = 0
    offsetY.value = 0
  } else if (oldSize !== nextSize) {
    const sizeRatio = nextSize / oldSize
    offsetX.value *= sizeRatio
    offsetY.value *= sizeRatio
    clampOffsets()
  }
}

function getOffsetBounds(targetZoom = zoom.value) {
  const displayWidth = imageNaturalWidth.value * baseScale.value * targetZoom
  const displayHeight = imageNaturalHeight.value * baseScale.value * targetZoom
  return {
    x: Math.max(0, (displayWidth - viewportSize.value) / 2),
    y: Math.max(0, (displayHeight - viewportSize.value) / 2),
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clampOffsets() {
  const bounds = getOffsetBounds()
  offsetX.value = clamp(offsetX.value, -bounds.x, bounds.x)
  offsetY.value = clamp(offsetY.value, -bounds.y, bounds.y)
}

function setZoom(nextZoom, focalPoint = null) {
  const previousZoom = zoom.value
  const clampedZoom = clamp(Number(nextZoom), 1, MAX_ZOOM)
  if (!Number.isFinite(clampedZoom) || clampedZoom === previousZoom) return

  if (focalPoint && viewportSize.value) {
    const center = viewportSize.value / 2
    const ratio = clampedZoom / previousZoom
    offsetX.value = focalPoint.x - center - (focalPoint.x - center - offsetX.value) * ratio
    offsetY.value = focalPoint.y - center - (focalPoint.y - center - offsetY.value) * ratio
  }

  zoom.value = clampedZoom
  clampOffsets()
}

function onZoomSlider(event) {
  setZoom(event.target.value)
}

function changeZoom(delta) {
  setZoom(zoom.value + delta)
}

function resetCrop() {
  zoom.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

function getViewportPoint(clientX, clientY) {
  const rect = cropViewportRef.value?.getBoundingClientRect()
  return rect
    ? { x: clientX - rect.left, y: clientY - rect.top }
    : { x: viewportSize.value / 2, y: viewportSize.value / 2 }
}

function getPointerDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function getPointerMidpoint(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function startPinch() {
  const points = [...activePointers.values()]
  if (points.length < 2) return

  pinchStart = {
    distance: getPointerDistance(points[0], points[1]),
    midpoint: getPointerMidpoint(points[0], points[1]),
    zoom: zoom.value,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  }
}

function onPointerDown(event) {
  if (!imageReady.value) return
  event.preventDefault()
  cropViewportRef.value?.setPointerCapture?.(event.pointerId)
  const point = getViewportPoint(event.clientX, event.clientY)
  activePointers.set(event.pointerId, point)

  if (activePointers.size === 1) {
    lastPointerPosition = point
  } else if (activePointers.size === 2) {
    startPinch()
  }
}

function onPointerMove(event) {
  if (!activePointers.has(event.pointerId)) return
  event.preventDefault()
  const point = getViewportPoint(event.clientX, event.clientY)
  activePointers.set(event.pointerId, point)

  if (activePointers.size >= 2 && pinchStart) {
    const points = [...activePointers.values()]
    const distance = getPointerDistance(points[0], points[1])
    const midpoint = getPointerMidpoint(points[0], points[1])
    const nextZoom = clamp(
      pinchStart.zoom * (distance / Math.max(1, pinchStart.distance)),
      1,
      MAX_ZOOM,
    )
    const scaleRatio = nextZoom / pinchStart.zoom
    const center = viewportSize.value / 2
    offsetX.value = midpoint.x - center
      - (pinchStart.midpoint.x - center - pinchStart.offsetX) * scaleRatio
    offsetY.value = midpoint.y - center
      - (pinchStart.midpoint.y - center - pinchStart.offsetY) * scaleRatio
    zoom.value = nextZoom
    clampOffsets()
    return
  }

  if (activePointers.size === 1 && lastPointerPosition) {
    offsetX.value += point.x - lastPointerPosition.x
    offsetY.value += point.y - lastPointerPosition.y
    lastPointerPosition = point
    clampOffsets()
  }
}

function onPointerEnd(event) {
  activePointers.delete(event.pointerId)
  pinchStart = null

  if (activePointers.size === 1) {
    lastPointerPosition = [...activePointers.values()][0]
  } else {
    lastPointerPosition = null
  }
}

function onWheel(event) {
  if (!imageReady.value) return
  event.preventDefault()
  const point = getViewportPoint(event.clientX, event.clientY)
  setZoom(zoom.value + (event.deltaY < 0 ? 0.15 : -0.15), point)
}

async function confirmCrop() {
  if (!imageReady.value || processingCrop.value) return
  processingCrop.value = true

  try {
    const blob = await createCroppedBlob()
    revokeObjectUrl(localPreviewUrl.value)
    localPreviewUrl.value = URL.createObjectURL(blob)
    previewUrl.value = localPreviewUrl.value

    processingCrop.value = false
    closeCropper()
    await upload(blob)
  } catch (err) {
    processingCrop.value = false
    setError(err.message || '图片裁剪失败，请重试')
  }
}

function createCroppedBlob() {
  const image = cropImageRef.value
  const size = viewportSize.value
  const displayScale = baseScale.value * zoom.value
  const displayWidth = imageNaturalWidth.value * displayScale
  const displayHeight = imageNaturalHeight.value * displayScale
  const imageLeft = (size - displayWidth) / 2 + offsetX.value
  const imageTop = (size - displayHeight) / 2 + offsetY.value
  const sourceX = -imageLeft / displayScale
  const sourceY = -imageTop / displayScale
  const sourceSize = size / displayScale

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('当前浏览器不支持图片裁剪'))

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('图片裁剪失败，请重试')),
      'image/jpeg',
      0.88,
    )
  })
}

async function upload(blob) {
  const uploadStartedAt = Date.now()
  uploading.value = true
  clearError()

  try {
    const res = await userApi.uploadAvatar(blob)
    if (typeof res?.data !== 'string') throw new Error('上传失败，请重试')

    try {
      await syncTokenAfterAvatarUpload(uploadStartedAt)
    } catch {
      // 上传已经成功；后续请求可继续通过 401 拦截器刷新凭证。
    }

    revokeObjectUrl(localPreviewUrl.value)
    localPreviewUrl.value = ''
    previewUrl.value = res.data
    emit('update:avatarUrl', res.data)
  } catch (err) {
    revokeObjectUrl(localPreviewUrl.value)
    localPreviewUrl.value = ''
    previewUrl.value = props.avatarUrl
    setError(err.message || '上传失败，请重试')
  } finally {
    uploading.value = false
  }
}

function revokeObjectUrl(url) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function setError(message) {
  errorMsg.value = message
  emit('error', message)
}

function clearError() {
  errorMsg.value = ''
}

onBeforeUnmount(() => {
  stopResizeObserver()
  if (cropDialogOpen.value) document.body.style.overflow = bodyOverflowBeforeCrop
  revokeObjectUrl(cropSourceUrl.value)
  revokeObjectUrl(localPreviewUrl.value)
})
</script>

<template>
  <div class="avatar-upload">
    <button
      type="button"
      class="avatar-trigger"
      :class="{ 'is-uploading': uploading }"
      :title="uploading ? '上传中…' : '点击更换头像'"
      :disabled="uploading"
      aria-label="更换头像"
      @click="triggerFilePicker"
    >
      <img v-if="previewUrl" :src="previewUrl" alt="头像" class="avatar-img" />
      <span v-else class="avatar-letter">{{ avatarLetter }}</span>

      <Transition name="overlay-fade">
        <span v-if="uploading" class="upload-overlay" aria-label="头像上传中">
          <span class="spinner"></span>
        </span>
      </Transition>

      <span v-if="!uploading" class="edit-hint" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
          <path
            d="M9.5 2.5L11.5 4.5L4.5 11.5H2.5V9.5L9.5 2.5Z"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </button>

    <Transition name="err-slide">
      <p v-if="errorMsg" class="error-msg" role="alert">{{ errorMsg }}</p>
    </Transition>

    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="hidden-input"
      @change="onFileChange"
    />

    <Teleport to="body">
      <Transition name="crop-dialog">
        <div
          v-if="cropDialogOpen"
          class="crop-backdrop"
          @click.self="closeCropper"
        >
          <section
            ref="cropDialogRef"
            class="crop-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-dialog-title"
            tabindex="-1"
            @keydown.esc="closeCropper"
          >
            <header class="crop-dialog-header">
              <div>
                <h2 id="crop-dialog-title">裁剪头像</h2>
                <p>拖动图片调整位置，缩放到合适大小</p>
              </div>
              <button
                type="button"
                class="crop-close-button"
                aria-label="关闭裁剪窗口"
                :disabled="processingCrop"
                @click="closeCropper"
              >×</button>
            </header>

            <div
              ref="cropViewportRef"
              class="crop-viewport"
              :class="{ 'is-ready': imageReady }"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerEnd"
              @pointercancel="onPointerEnd"
              @wheel="onWheel"
            >
              <img
                ref="cropImageRef"
                :src="cropSourceUrl"
                :style="cropImageStyle"
                class="crop-source-image"
                alt="待裁剪头像"
                draggable="false"
                @load="onCropImageLoad"
                @error="onCropImageError"
              />
              <div class="crop-grid" aria-hidden="true">
                <span></span><span></span><span></span><span></span>
              </div>
              <div v-if="!imageReady" class="crop-loading">
                <span class="spinner"></span>
              </div>
            </div>

            <div class="crop-controls">
              <div class="zoom-row">
                <button
                  type="button"
                  class="zoom-button"
                  aria-label="缩小图片"
                  :disabled="!imageReady || zoom <= 1"
                  @click="changeZoom(-0.2)"
                >−</button>
                <input
                  class="zoom-slider"
                  type="range"
                  min="1"
                  :max="MAX_ZOOM"
                  step="0.01"
                  :value="zoom"
                  aria-label="头像缩放比例"
                  :disabled="!imageReady"
                  @input="onZoomSlider"
                />
                <button
                  type="button"
                  class="zoom-button"
                  aria-label="放大图片"
                  :disabled="!imageReady || zoom >= MAX_ZOOM"
                  @click="changeZoom(0.2)"
                >＋</button>
              </div>
              <button
                type="button"
                class="reset-button"
                :disabled="!imageReady"
                @click="resetCrop"
              >还原</button>
            </div>

            <footer class="crop-actions">
              <button
                type="button"
                class="crop-action secondary"
                :disabled="processingCrop"
                @click="closeCropper"
              >取消</button>
              <button
                type="button"
                class="crop-action primary"
                :disabled="!imageReady || processingCrop"
                @click="confirmCrop"
              >{{ processingCrop ? '处理中…' : '确定并上传' }}</button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.avatar-upload {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avatar-trigger {
  position: relative;
  width: 80px;
  height: 80px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  background: #111;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.avatar-trigger:hover {
  transform: scale(1.04);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.avatar-trigger:focus-visible {
  outline: 2px solid var(--accent-color, #409eff);
  outline-offset: 3px;
}

.avatar-trigger.is-uploading {
  cursor: wait;
  transform: none;
}

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

.upload-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

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

.avatar-trigger:hover .edit-hint,
.avatar-trigger:focus-visible .edit-hint {
  opacity: 1;
}

.error-msg {
  margin: 0;
  font-size: 12px;
  color: #d32f2f;
  text-align: center;
  max-width: 220px;
  line-height: 1.4;
}

.hidden-input {
  display: none;
}

.crop-backdrop {
  position: fixed;
  z-index: 3000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.68);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

.crop-dialog-panel {
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 20px;
  color: var(--text-primary, #1f2329);
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.12));
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
  outline: none;
}

.crop-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.crop-dialog-header h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.4;
}

.crop-dialog-header p {
  margin: 4px 0 0;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  line-height: 1.5;
}

.crop-close-button,
.zoom-button,
.reset-button,
.crop-action {
  border: 1px solid var(--border-color, #d8dce5);
  color: var(--text-primary, #1f2329);
  background: var(--bg-primary, #fff);
  cursor: pointer;
}

.crop-close-button {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  padding: 0;
  font-size: 24px;
  line-height: 32px;
}

.crop-close-button:hover,
.zoom-button:hover:not(:disabled),
.reset-button:hover,
.crop-action.secondary:hover {
  background: var(--bg-secondary, #f3f4f6);
}

.crop-viewport {
  position: relative;
  width: min(360px, calc(100vw - 72px));
  width: min(360px, calc(100vw - 72px), calc(100dvh - 276px));
  min-width: 200px;
  aspect-ratio: 1;
  margin: 0 auto;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.92);
  outline: 1px solid rgba(0, 0, 0, 0.4);
  background: #141414;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.crop-viewport:active {
  cursor: grabbing;
}

.crop-source-image {
  position: absolute;
  display: block;
  max-width: none;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.42);
}

.crop-grid span {
  position: absolute;
  background: rgba(255, 255, 255, 0.38);
}

.crop-grid span:nth-child(1),
.crop-grid span:nth-child(2) {
  top: 0;
  bottom: 0;
  width: 1px;
}

.crop-grid span:nth-child(1) { left: 33.333%; }
.crop-grid span:nth-child(2) { left: 66.666%; }

.crop-grid span:nth-child(3),
.crop-grid span:nth-child(4) {
  right: 0;
  left: 0;
  height: 1px;
}

.crop-grid span:nth-child(3) { top: 33.333%; }
.crop-grid span:nth-child(4) { top: 66.666%; }

.crop-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #141414;
}

.crop-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 18px;
}

.zoom-row {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.zoom-button {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}

.zoom-button:disabled,
.crop-close-button:disabled,
.reset-button:disabled,
.zoom-slider:disabled,
.crop-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.zoom-slider {
  width: 100%;
  min-width: 80px;
  accent-color: var(--accent-color, #409eff);
  cursor: pointer;
}

.reset-button {
  height: 36px;
  padding: 0 12px;
  white-space: nowrap;
}

.crop-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.crop-action {
  min-width: 88px;
  min-height: 40px;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 600;
}

.crop-action.primary {
  border-color: var(--text-primary, #111);
  color: var(--bg-primary, #fff);
  background: var(--text-primary, #111);
}

.crop-action.primary:hover:not(:disabled) {
  filter: brightness(0.94);
}

.overlay-fade-enter-active,
.overlay-fade-leave-active,
.err-slide-enter-active,
.err-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to,
.err-slide-enter-from,
.err-slide-leave-to {
  opacity: 0;
}

.err-slide-enter-from,
.err-slide-leave-to {
  transform: translateY(-4px);
}

.crop-dialog-enter-active,
.crop-dialog-leave-active {
  transition: opacity 0.18s ease;
}

.crop-dialog-enter-active .crop-dialog-panel,
.crop-dialog-leave-active .crop-dialog-panel {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.crop-dialog-enter-from,
.crop-dialog-leave-to,
.crop-dialog-enter-from .crop-dialog-panel,
.crop-dialog-leave-to .crop-dialog-panel {
  opacity: 0;
}

.crop-dialog-enter-from .crop-dialog-panel,
.crop-dialog-leave-to .crop-dialog-panel {
  transform: translateY(8px) scale(0.98);
}

@media (max-width: 520px) {
  .crop-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .crop-dialog-panel {
    width: 100%;
    max-height: 100vh;
    max-height: 100dvh;
    padding: 16px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }

  .crop-viewport {
    width: calc(100vw - 48px);
    width: min(calc(100vw - 48px), calc(100dvh - 268px));
    min-width: 180px;
  }

  .crop-controls {
    gap: 10px;
    margin-top: 14px;
  }

  .zoom-button,
  .reset-button,
  .crop-action {
    min-height: 44px;
  }

  .zoom-button {
    flex-basis: 44px;
    width: 44px;
  }

  .crop-actions {
    margin-top: 16px;
  }

  .crop-action {
    flex: 1;
  }
}

@media (max-height: 560px) and (orientation: landscape) {
  .crop-dialog-panel {
    width: min(680px, calc(100vw - 24px));
  }

  .crop-dialog-header {
    margin-bottom: 10px;
  }

  .crop-dialog-header p {
    display: none;
  }

  .crop-viewport {
    width: min(280px, calc(100vh - 174px));
    width: min(280px, calc(100dvh - 174px));
  }

  .crop-controls,
  .crop-actions {
    margin-top: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .avatar-trigger,
  .edit-hint,
  .overlay-fade-enter-active,
  .overlay-fade-leave-active,
  .err-slide-enter-active,
  .err-slide-leave-active,
  .crop-dialog-enter-active,
  .crop-dialog-leave-active,
  .crop-dialog-enter-active .crop-dialog-panel,
  .crop-dialog-leave-active .crop-dialog-panel {
    transition: none;
  }
}
</style>
