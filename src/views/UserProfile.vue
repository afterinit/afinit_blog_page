<script setup>
import { reactive, ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import SHA256 from 'crypto-js/sha256'
import { useTurnstile } from '../composables/useTurnstile.js'
import { hasAuthSession, isAccessTokenExpired } from '../utils/auth.js'
import { useUserInfo } from '../composables/useUserInfo.js'
import { assertApiSuccess } from '../utils/apiResponse.js'
import request from '../utils/request.js'
import AvatarUpload from '../components/AvatarUpload.vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL

// ─── 基础 ──────────────────────────────────────────────────────────────────────

const router = useRouter()
const { userInfo, fetchUserInfo, patchUserInfo } = useUserInfo()

const pageLoading = ref(false)
const pageError   = ref('')

function formatTime(raw) {
  if (!raw) return '—'
  try {
    return new Date(raw).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return raw }
}

// ─── 修改昵称（无需验证码） ────────────────────────────────────────────────────

function useEditNickname() {
  const show    = ref(false)
  const value   = ref('')
  const loading = ref(false)
  const error   = ref('')
  const success = ref('')

  function open() {
    value.value   = userInfo.value?.nickname ?? ''
    error.value   = ''
    success.value = ''
    show.value    = true
  }

  function close() { show.value = false }

  async function submit() {
    error.value = ''
    const trimmed = value.value.trim()
    if (!trimmed)            { error.value = '昵称不能为空'; return }
    if (trimmed.length > 50) { error.value = '昵称最长 50 个字符'; return }
    if (trimmed === userInfo.value?.nickname) { close(); return }

    loading.value = true
    try {
      const response = await request(`${API_BASE}/user/nickname`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nickname: trimmed }),
      })
      const res = await response.json()
      assertApiSuccess(response, res, [20041], '修改失败')
      patchUserInfo({ nickname: trimmed })
      success.value = '修改成功'
      setTimeout(() => { show.value = false; success.value = '' }, 900)
    } catch (e) {
      error.value = e.message || '修改失败，请重试'
    } finally {
      loading.value = false
    }
  }

  return { show, value, loading, error, success, open, close, submit }
}

// ─── 修改信息（用户名 / 密码，需邮箱验证码） ────────────────────────────────────

function useEditInfo() {
  // 表单
  const show = ref(false)
  const form = reactive({ username: '', password: '', confirmPassword: '', code: '' })
  const loading = ref(false)
  const error   = ref('')
  const success = ref('')

  // 验证码倒计时
  const countdown = ref(0)
  const isSending = ref(false)
  let countdownTimer = null

  const canGetCode  = computed(() => countdown.value === 0 && !isSending.value)
  const codeBtnText = computed(() => {
    if (isSending.value)    return '发送中…'
    if (countdown.value > 0) return `${countdown.value}s 后重发`
    return '获取验证码'
  })

  function startCountdown() {
    countdown.value = 60
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) { clearInterval(countdownTimer); countdown.value = 0 }
    }, 1000)
  }

  const showTurnstile = ref(false)

  const turnstile = useTurnstile({
    containerSelector: '#turnstile-profile-container',
    onSuccess: (token) => sendCode(token),
    onError(code) {
      error.value = code === 'script_load'
        ? '人机验证脚本加载失败，请检查网络连接'
        : `人机验证失败（${code}），请重试`
    },
    onExpired() {
      error.value = '人机验证已过期，请重新验证'
      turnstile.reset()
    },
  })

  function closeTurnstile() {
    showTurnstile.value = false
    turnstile.removeWidget()
  }

  async function handleGetCode() {
    error.value = ''
    if (!form.username.trim() && !form.password) {
      error.value = '请至少填写一项要修改的内容'; return
    }
    if (!userInfo.value?.email) {
      error.value = '当前账号未绑定邮箱，无法发送验证码'; return
    }
    if (!turnstile.siteKeyConfigured) {
      error.value = '系统配置错误：人机验证不可用'; return
    }
    showTurnstile.value = true
    await nextTick()
    turnstile.inject()
  }

  async function sendCode(cfToken) {
    isSending.value = true
    try {
      const response = await request(`${API_BASE}/user/code`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cfToken, to: userInfo.value.email }),
      })
      const res = await response.json()
      assertApiSuccess(response, res, [20502], '验证码发送失败')
      closeTurnstile()
      startCountdown()
    } catch (e) {
      closeTurnstile()
      error.value = e.message || '验证码发送失败，请稍后重试'
    } finally {
      isSending.value = false
    }
  }

  // ── Modal 开关 ────────────────────────────────────────────────────────────────

  function open() {
    Object.assign(form, { username: '', password: '', confirmPassword: '', code: '' })
    error.value   = ''
    success.value = ''
    countdown.value = 0
    clearInterval(countdownTimer)
    show.value = true
  }

  function close() {
    show.value = false
    closeTurnstile()
  }

  // ── 提交 ─────────────────────────────────────────────────────────────────────

  async function submit() {
    error.value = ''

    const username = form.username.trim()

    if (!username && !form.password) {
      error.value = '请至少填写一项要修改的内容'; return
    }
    if (username && username.length > 50) {
      error.value = '用户名最长 50 个字符'; return
    }
    if (form.password && form.password.length < 6) {
      error.value = '密码至少 6 位'; return
    }
    if (form.password && form.password.length > 30) {
      error.value = '密码最长 30 个字符'; return
    }
    if (form.password && form.password !== form.confirmPassword) {
      error.value = '两次密码不一致'; return
    }
    if (!form.code) {
      error.value = '请输入验证码'; return
    }

    loading.value = true
    try {
      const body = {
        email: userInfo.value.email,
        code:  form.code,
      }
      if (username)      body.username = username
      if (form.password) body.password = SHA256(form.password).toString()

      const response = await request(`${API_BASE}/user/info`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const res = await response.json()
      assertApiSuccess(response, res, [20041], '修改失败')

      success.value = '修改成功'
      setTimeout(() => { show.value = false; success.value = '' }, 900)
    } catch (e) {
      error.value = e.message || '修改失败，请重试'
    } finally {
      loading.value = false
    }
  }

  function cleanup() {
    clearInterval(countdownTimer)
    closeTurnstile()
  }

  return {
    show, form, loading, error, success,
    countdown, isSending, canGetCode, codeBtnText,
    showTurnstile, scriptLoading: turnstile.scriptLoading,
    open, close, submit, handleGetCode, closeTurnstile, cleanup,
  }
}

// ─── 实例化 ────────────────────────────────────────────────────────────────────

const editNickname = useEditNickname()
const editInfo     = useEditInfo()

// ─── 注销账号 ────────────────────────────────────────────────────────────────────
function useDeleteAccount() {
  const show = ref(false)
  const loading = ref(false)
  const error = ref('')

  function open() {
    error.value = ''
    show.value = true
  }

  function close() {
    show.value = false
  }

  async function submit() {
    if (!userInfo.value || !userInfo.value.id) return
    loading.value = true
    error.value = ''
    try {
      const response = await request(`${API_BASE}/user/${userInfo.value.id}`, {
        method: 'DELETE'
      })
      const res = await response.json()
      assertApiSuccess(response, res, [], '注销失败')
      
      // Success: clear info and redirect to login
      const { clearUserInfo } = useUserInfo()
      clearUserInfo()
      router.push('/login')
    } catch (e) {
      error.value = e.message || '注销失败，请重试'
    } finally {
      loading.value = false
    }
  }

  return { show, loading, error, open, close, submit }
}
const deleteAccount = useDeleteAccount()

async function onAvatarUpdated(url) {
  patchUserInfo({ avatar: url })
  await fetchUserInfo()
}

// ─── 生命周期 ──────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!hasAuthSession()) { router.push('/login'); return }
  if (!userInfo.value || isAccessTokenExpired()) pageLoading.value = true
  try {
    await fetchUserInfo()
    if (!hasAuthSession()) {
      router.push('/login')
      return
    }
  } catch {
    if (!userInfo.value) pageError.value = '获取用户信息失败，请刷新重试'
  } finally {
    pageLoading.value = false
  }
})

onUnmounted(() => {
  editInfo.cleanup()
})
</script>

<template>
  <div class="container">

    <!-- 顶部导航 -->
    <header class="header">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        返回
      </button>
      <span class="header-title">个人资料</span>
      <div style="width: 60px"></div>
    </header>

    <div v-if="pageLoading" class="status-msg">正在加载...</div>
    <div v-else-if="pageError" class="status-msg error">{{ pageError }}</div>

    <template v-else-if="userInfo">

      <!-- 头像 + 昵称 -->
      <div class="avatar-section">
        <AvatarUpload
          :avatar-url="userInfo.avatar"
          :nickname="userInfo.nickname"
          @update:avatar-url="onAvatarUpdated"
          @error="msg => pageError = msg"
        />
        <div class="avatar-info">
          <div class="user-name">{{ userInfo.nickname || '未设置昵称' }}</div>
          <div class="user-id">UID · {{ userInfo.id != null ? String(userInfo.id) : '—' }}</div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 信息列表 -->
      <dl class="info-list">
        <div class="info-row">
          <dt>昵称</dt>
          <dd class="info-dd-action">
            <span class="info-value">{{ userInfo.nickname || '—' }}</span>
            <button class="edit-btn" @click="editNickname.open">修改</button>
          </dd>
        </div>
        <div class="info-row">
          <dt>邮箱</dt>
          <dd>{{ userInfo.email || '—' }}</dd>
        </div>
        <div class="info-row">
          <dt>注册时间</dt>
          <dd>{{ formatTime(userInfo.createTime) }}</dd>
        </div>
        <div class="info-row">
          <dt>最后更新</dt>
          <dd>{{ formatTime(userInfo.updateTime) }}</dd>
        </div>
      </dl>

      <div class="divider"></div>

      <!-- 操作入口 -->
      <div class="action-group" style="display: flex; gap: 10px;">
        <button class="btn btn-outline full-width" @click="editInfo.open">修改信息</button>
        <button class="btn btn-danger full-width" @click="deleteAccount.open">注销账号</button>
      </div>

    </template>

    <!-- ── 修改昵称 Modal ──────────────────────────────────────────────────────── -->
    <Transition name="modal">
      <div v-if="editNickname.show.value" class="modal-overlay" @mousedown.self="editNickname.close">
        <div class="modal-box">
          <div class="modal-header">
            <span>修改昵称</span>
            <button class="modal-close" @click="editNickname.close">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>新昵称</label>
              <input
                v-model.trim="editNickname.value.value"
                type="text"
                placeholder="请输入新昵称（最多 50 字符）"
                maxlength="50"
                :disabled="editNickname.loading.value"
                @keyup.enter="editNickname.submit"
                autofocus
              />
            </div>
            <p v-if="editNickname.error.value"   class="form-error">{{ editNickname.error.value }}</p>
            <p v-if="editNickname.success.value" class="form-success">{{ editNickname.success.value }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="editNickname.close" :disabled="editNickname.loading.value">取消</button>
            <button class="btn" @click="editNickname.submit" :disabled="editNickname.loading.value">
              {{ editNickname.loading.value ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── 修改信息 Modal ──────────────────────────────────────────────────────── -->
    <Transition name="modal">
      <div v-if="editInfo.show.value" class="modal-overlay" @mousedown.self="editInfo.close">
        <div class="modal-box modal-box-lg">
          <div class="modal-header">
            <span>修改信息</span>
            <button class="modal-close" @click="editInfo.close">✕</button>
          </div>
          <div class="modal-body">

            <!-- 用户名 -->
            <div class="form-group">
              <label>用户名 <span class="field-hint">留空则不修改</span></label>
              <input
                v-model.trim="editInfo.form.username"
                type="text"
                placeholder="请输入新用户名（最多 50 字符）"
                maxlength="50"
                :disabled="editInfo.loading.value"
              />
            </div>

            <!-- 密码 -->
            <div class="form-group">
              <label>新密码 <span class="field-hint">留空则不修改</span></label>
              <input
                v-model="editInfo.form.password"
                type="password"
                placeholder="请输入新密码（6 - 30 位）"
                :disabled="editInfo.loading.value"
                autocomplete="new-password"
              />
            </div>

            <!-- 确认密码（有密码时才显示） -->
            <div class="form-group" v-if="editInfo.form.password">
              <label>确认新密码</label>
              <input
                v-model="editInfo.form.confirmPassword"
                type="password"
                placeholder="再次输入新密码"
                :disabled="editInfo.loading.value"
                autocomplete="new-password"
              />
            </div>

            <!-- 邮箱（接口待实现，暂不可用） -->
            <div class="form-group">
              <label>
                邮箱
                <!-- TODO: 邮箱修改需单独接口（两步验证），后端完成后启用 -->
                <span class="field-hint">暂不支持修改邮箱</span>
              </label>
              <input
                type="email"
                :value="userInfo?.email || ''"
                disabled
                class="input-disabled"
              />
            </div>

            <div class="divider-light"></div>

            <!-- 验证码行 -->
            <div class="form-group">
              <label>邮箱验证码 <span class="field-hint">发送至当前绑定邮箱</span></label>
              <div class="code-row">
                <input
                  v-model.trim="editInfo.form.code"
                  type="text"
                  placeholder="请输入 6 位验证码"
                  maxlength="6"
                  :disabled="editInfo.loading.value"
                />
                <button
                  type="button"
                  class="btn code-btn"
                  :disabled="!editInfo.canGetCode.value"
                  @click="editInfo.handleGetCode"
                >
                  {{ editInfo.codeBtnText.value }}
                </button>
              </div>
            </div>

            <p v-if="editInfo.error.value"   class="form-error">{{ editInfo.error.value }}</p>
            <p v-if="editInfo.success.value" class="form-success">{{ editInfo.success.value }}</p>

          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="editInfo.close" :disabled="editInfo.loading.value">取消</button>
            <button class="btn" @click="editInfo.submit" :disabled="editInfo.loading.value">
              {{ editInfo.loading.value ? '提交中…' : '确认修改' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── 注销账号 Modal ──────────────────────────────────────────────────────── -->
    <Transition name="modal">
      <div v-if="deleteAccount.show.value" class="modal-overlay" @mousedown.self="deleteAccount.close">
        <div class="modal-box">
          <div class="modal-header">
            <span>注销账号</span>
            <button class="modal-close" @click="deleteAccount.close">✕</button>
          </div>
          <div class="modal-body">
            <p>确定要注销您的账号吗？此操作不可逆，您的所有数据将被永久删除。</p>
            <p v-if="deleteAccount.error.value" class="form-error">{{ deleteAccount.error.value }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="deleteAccount.close" :disabled="deleteAccount.loading.value">取消</button>
            <button class="btn btn-danger" @click="deleteAccount.submit" :disabled="deleteAccount.loading.value">
              {{ deleteAccount.loading.value ? '注销中…' : '确认注销' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Turnstile Modal（叠加在修改信息 Modal 上方） ───────────────────────── -->
    <Transition name="modal-fade">
      <div v-if="editInfo.showTurnstile.value" class="modal-backdrop-top" @mousedown.self="editInfo.closeTurnstile">
        <div class="turnstile-card">
          <div class="modal-header">
            <span>请完成人机验证</span>
            <button class="modal-close" @click="editInfo.closeTurnstile">✕</button>
          </div>
          <div class="turnstile-body">
            <div v-if="editInfo.scriptLoading.value" class="turnstile-skeleton">
              <div class="skeleton-shimmer"></div>
            </div>
            <div id="turnstile-profile-container"></div>
          </div>
          <p class="turnstile-hint">验证通过后将自动发送验证码</p>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }

/* ── 导航 ─────────────────────────────────────────────────────────────────────── */
.header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #eee;
}
.header-title { font-size: 16px; font-weight: 600; color: #111; }
.back-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 13px; color: #555; background: none; border: none;
  cursor: pointer; padding: 4px 0; transition: color 0.15s;
}
.back-btn:hover { color: #111; }

.status-msg { text-align: center; color: #999; margin-top: 80px; font-size: 14px; }
.status-msg.error { color: #d32f2f; }

/* ── 头像 ─────────────────────────────────────────────────────────────────────── */
.avatar-section { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; }
.avatar-info    { display: flex; flex-direction: column; gap: 4px; }
.user-name      { font-size: 20px; font-weight: 600; color: #111; }
.user-id        { font-size: 12px; color: #aaa; }

/* ── 分割线 ───────────────────────────────────────────────────────────────────── */
.divider       { height: 1px; background: #f0f0f0; margin: 8px 0; }
.divider-light { height: 1px; background: #f5f5f5; margin: 4px 0 12px; }

/* ── 信息列表 ─────────────────────────────────────────────────────────────────── */
.info-list { margin: 0; padding: 12px 0; display: flex; flex-direction: column; }
.info-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 0; border-bottom: 1px solid #f5f5f5;
}
.info-row:last-child { border-bottom: none; }
.info-row dt { font-size: 13px; color: #888; flex-shrink: 0; }
.info-row dd { font-size: 13px; color: #222; margin: 0; text-align: right; word-break: break-all; }

.info-dd-action { display: flex; align-items: center; gap: 12px; }
.info-value     { color: #222; font-size: 13px; }

.edit-btn {
  flex-shrink: 0;
  padding: 3px 10px; font-size: 12px; color: #555;
  background: transparent; border: 1px solid #ddd; border-radius: 4px;
  cursor: pointer; transition: all 0.15s;
}
.edit-btn:hover { background: #f5f5f5; border-color: #bbb; color: #111; }

/* ── 操作入口 ─────────────────────────────────────────────────────────────────── */
.action-group { padding-top: 20px; }
.full-width   { width: 100%; }

/* ── 按钮 ─────────────────────────────────────────────────────────────────────── */
.btn {
  padding: 9px 20px;
  background-color: #111; color: #fff;
  border: 1px solid #111; border-radius: 4px;
  font-size: 13px; cursor: pointer; transition: all 0.2s;
}
.btn:hover:not(:disabled) { background-color: #333; border-color: #333; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline { background-color: transparent; color: #111; border-color: #ccc; }
.btn-outline:hover:not(:disabled) { background-color: #f5f5f5; border-color: #111; }
.btn-outline:hover:not(:disabled) { background-color: #f5f5f5; border-color: #111; }
.btn-ghost { background: transparent; color: #555; border-color: #ddd; }
.btn-ghost:hover:not(:disabled) { background: #f5f5f5; border-color: #bbb; color: #111; }
.btn-danger { background-color: #d32f2f; color: #fff; border-color: #d32f2f; }
.btn-danger:hover:not(:disabled) { background-color: #b71c1c; border-color: #b71c1c; }

/* 获取验证码按钮 */
.code-btn {
  flex-shrink: 0;
  padding: 9px 14px; font-size: 12px;
  white-space: nowrap;
}

/* ── Modal 通用 ───────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.35);
  backdrop-filter: blur(2px); display: flex; justify-content: center;
  align-items: center; z-index: 999; padding: 20px;
}
.modal-box {
  background: #fff; border-radius: 10px;
  width: 100%; max-width: 400px;
  box-shadow: 0 16px 48px rgba(0,0,0,.14); overflow: hidden;
}
.modal-box-lg { max-width: 460px; }

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 18px 24px 16px; border-bottom: 1px solid #f0f0f0;
  font-size: 15px; font-weight: 600; color: #111;
}
.modal-close {
  background: none; border: none; color: #aaa;
  font-size: 14px; cursor: pointer; transition: color 0.15s; line-height: 1;
}
.modal-close:hover { color: #111; }
.modal-body   { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; max-height: 70vh; overflow-y: auto; }
.modal-footer { display: flex; gap: 10px; padding: 16px 24px 20px; border-top: 1px solid #f0f0f0; justify-content: flex-end; }

/* ── 表单元素 ─────────────────────────────────────────────────────────────────── */
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label {
  font-size: 13px; color: #555; font-weight: 500;
  display: flex; align-items: center; gap: 6px;
}
.field-hint  { font-size: 11px; color: #bbb; font-weight: 400; }

.form-group input {
  padding: 9px 12px; border: 1px solid #ddd; border-radius: 4px;
  font-size: 14px; outline: none; transition: border-color 0.2s;
  box-sizing: border-box; width: 100%;
}
.form-group input:focus    { border-color: #111; }
.form-group input:disabled,
.input-disabled            { background: #fafafa; color: #bbb; cursor: not-allowed; }

.code-row { display: flex; gap: 8px; }
.code-row input { flex: 1; min-width: 0; }

.form-error   { font-size: 13px; color: #d32f2f; margin: 0; }
.form-success { font-size: 13px; color: #2e7d32; margin: 0; }

/* ── Turnstile overlay（z-index 高于修改信息 Modal） ──────────────────────────── */
.modal-backdrop-top {
  position: fixed; inset: 0; background: rgba(0,0,0,.5);
  backdrop-filter: blur(4px); display: flex; justify-content: center;
  align-items: center; z-index: 1100;
}
.turnstile-card {
  background: #fff; border-radius: 10px; padding: 0;
  width: 340px; box-shadow: 0 8px 32px rgba(0,0,0,.18); overflow: hidden;
}
.turnstile-body  { display: flex; justify-content: center; padding: 20px 24px; min-height: 85px; }
.turnstile-hint  { text-align: center; font-size: 12px; color: #999; padding: 0 24px 16px; margin: 0; }

.turnstile-skeleton {
  width: 300px; height: 65px; border-radius: 6px;
  overflow: hidden; background: #e8e8e8; position: relative;
}
.skeleton-shimmer {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%);
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* ── 过渡动画 ─────────────────────────────────────────────────────────────────── */
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-active .modal-box, .modal-leave-active .modal-box { transition: transform 0.2s ease, opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-box, .modal-leave-to .modal-box { transform: translateY(12px); opacity: 0; }

.modal-fade-enter-active { transition: opacity 0.2s, transform 0.2s; }
.modal-fade-leave-active { transition: opacity 0.15s, transform 0.15s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.96); }
</style>
