<script setup>
import { ref, onMounted, onUnmounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { registerHomeRefresh } from '../composables/useHomeRefresh.js'
import { useDialog } from '../composables/useDialog.js'
import { removeToken, hasAuthSession } from '../utils/auth.js'
import { useUserInfo } from '../composables/useUserInfo.js'
import { assertApiSuccess } from '../utils/apiResponse.js'
import request, { AuthError } from '../utils/request.js'

defineOptions({ name: 'BlogList' })

const API_BASE = import.meta.env.VITE_API_BASE_URL

const router = useRouter()
const {
  userInfo,
  isLoggedIn,
  avatarLetter,
  avatarCacheKey,
  fetchUserInfo,
  resolveAvatarUrl,
  clearUserInfo,
} = useUserInfo()
const {
  dialog: customAlert,
  showDialog: showAlert,
  showConfirm,
  confirmDialog: handleAlertConfirm,
  cancelDialog: handleAlertCancel,
} = useDialog()

// ─── 文章列表 ──────────────────────────────────────────────────────────────────

const currentTab   = ref('public')
const posts        = ref([])
const postsLoading = ref(false)
const postsError   = ref('')

async function fetchPosts(silent = false) {
  if (!silent) postsLoading.value = true
  postsError.value   = ''
  try {
    const url = currentTab.value === 'public'
      ? `${API_BASE}/blog?page=1&size=10`
      : `${API_BASE}/blog/private?page=1&size=10`
    const response = await request(url)
    const res = await response.json()
    assertApiSuccess(response, res, [30041], '文章列表加载失败')
    const data = res.data
    posts.value = Array.isArray(data) ? data : (data?.records ?? [])
  } catch (err) {
    if (!(err instanceof AuthError)) {
      postsError.value = `加载失败：${err.message}`
    } else if (currentTab.value === 'private') {
      postsError.value = '请先登录以查看草稿'
    }
  } finally {
    if (!silent) postsLoading.value = false
  }
}

function switchTab(tab) {
  if (currentTab.value === tab) return
  currentTab.value = tab
  if (tab === 'users') {
    fetchAdminUsers()
  } else {
    fetchPosts()
  }
}

// ─── 用户管理 ──────────────────────────────────────────────────────────────────

const adminUsers = ref([])
const adminUserTotal = ref(0)
const adminUserPage = ref(1)
const adminUserSize = ref(10)
const adminUsersLoading = ref(false)
const adminUsersError = ref('')

async function fetchAdminUsers() {
  adminUsersLoading.value = true
  adminUsersError.value = ''
  try {
    const url = new URL(`${API_BASE}/admin`)
    url.searchParams.append('page', adminUserPage.value)
    url.searchParams.append('size', adminUserSize.value)
    
    const response = await request(url.toString())
    const res = await response.json()
    assertApiSuccess(response, res, [], '获取用户列表失败')
    
    adminUsers.value = res.data.records || res.data.items || []
    adminUserTotal.value = res.data.total || 0
  } catch (err) {
    if (!err.isAuthError) adminUsersError.value = err.message || '获取用户列表失败'
  } finally {
    adminUsersLoading.value = false
  }
}

function changeAdminUserPage(p) {
  if (p < 1) return
  adminUserPage.value = p
  fetchAdminUsers()
}

function deleteAdminUser(user) {
  showConfirm(`确定要注销用户 ${user.id || user.nickname} 吗？此操作不可逆。`, async () => {
    try {
      const response = await request(`${API_BASE}/user/${user.id}`, {
        method: 'DELETE'
      })
      const res = await response.json()
      if (response.ok && String(res.code).endsWith('1')) {
        showAlert('注销成功！')
        fetchAdminUsers()
      } else {
        const msg = res.msg || res.message || '注销失败'
        showAlert(`注销失败：${msg}`)
      }
    } catch (err) {
      if (!err.isAuthError) showAlert(`网络错误：${err.message}`)
    }
  })
}

function blockAdminUser(user) {
  const isNormal = user.status !== 0;
  const targetStatus = isNormal ? 0 : 1;
  const actionName = isNormal ? '停用' : '启用';

  showConfirm(`确定要${actionName}用户 ${user.id || user.nickname} 吗？`, async () => {
    try {
      const response = await request(`${API_BASE}/admin/${user.id}?status=${targetStatus}`, {
        method: 'PUT'
      })
      const res = await response.json()
      if (response.ok && String(res.code).endsWith('1')) {
        showAlert(`${actionName}成功！`)
        fetchAdminUsers()
      } else {
        const msg = res.msg || res.message || `${actionName}失败`
        showAlert(`${actionName}失败：${msg}`)
      }
    } catch (err) {
      if (!err.isAuthError) showAlert(`网络错误：${err.message}`)
    }
  })
}

function formatTime(raw) {
  if (!raw) return '—'
  try {
    return new Date(raw).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return raw }
}


// ─── 弹窗 ──────────────────────────────────────────────────────────────────────

// ─── 审核文章 ──────────────────────────────────────────────────────────────────

async function approvePost(id) {
  try {
    const response = await request(`${API_BASE}/admin/toPublic/${id}`, {
      method: 'PUT'
    })
    const res = await response.json()
    if (response.ok && String(res.code) === '30031') {
      // 立即无感移除该项，并静默刷新列表
      posts.value = posts.value.filter(p => p.id !== id)
      fetchPosts(true)
      
      showAlert(res.msg || res.message || '更新成功！')
    } else {
      const msg = res.msg || res.message || '审核失败'
      showAlert(`审核失败：${msg}`)
    }
  } catch (err) {
    if (!err.isAuthError) {
      showAlert(`网络错误：${err.message}`)
    }
  }
}

function deletePost(id) {
  showConfirm('确定要删除这篇文章吗？此操作不可恢复。', async () => {
    try {
      const response = await request(`${API_BASE}/blog/${id}`, {
        method: 'DELETE'
      })
      const res = await response.json()
      // 判断成功状态码是否以 1 结尾
      if (response.ok && String(res.code).endsWith('1')) {
        posts.value = posts.value.filter(p => p.id !== id)
        fetchPosts(true)
        showAlert(res.msg || res.message || '删除成功！')
      } else {
        const msg = res.msg || res.message || '删除失败'
        showAlert(`删除失败：${msg}`)
      }
    } catch (err) {
      if (!err.isAuthError) {
        showAlert(`网络错误：${err.message}`)
      }
    }
  })
}

// ─── 退出登录 ──────────────────────────────────────────────────────────────────

const logoutLoading = ref(false)

async function logout() {
  showDropdown.value  = false
  logoutLoading.value = true
  await new Promise(r => setTimeout(r, 400))
  removeToken()
  clearUserInfo()
  currentTab.value = 'public'
  logoutLoading.value = false
  router.push('/')
}

// ─── 用户下拉菜单 ──────────────────────────────────────────────────────────────

const showDropdown = ref(false)
const userMenuRef  = ref(null)
const showToolsDropdown = ref(false)
const toolsMenuRef = ref(null)

function onOutsideClick(e) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
    showDropdown.value = false
  }
  if (toolsMenuRef.value && !toolsMenuRef.value.contains(e.target)) {
    showToolsDropdown.value = false
  }
}

// ─── 生命周期 ──────────────────────────────────────────────────────────────────

async function refreshHome(scope = { posts: true, user: true }) {
  isLoggedIn.value = hasAuthSession()
  const tasks = []
  if (scope.posts !== false) {
    if (currentTab.value === 'users') {
      tasks.push(fetchAdminUsers())
    } else {
      const isSilent = posts.value.length > 0
      tasks.push(fetchPosts(isSilent))
    }
  }
  if (scope.user !== false) tasks.push(fetchUserInfo())
  await Promise.all(tasks)
}

let unregisterHomeRefresh = null

onMounted(() => {
  document.addEventListener('click', onOutsideClick)
  unregisterHomeRefresh = registerHomeRefresh(refreshHome)
  refreshHome()
})

onActivated(() => {
  refreshHome()
})

onUnmounted(() => {
  document.removeEventListener('click', onOutsideClick)
  unregisterHomeRefresh?.()
})
</script>

<template>
  <div class="container">

    <Transition name="fade">
      <div v-if="logoutLoading" class="loading-overlay">
        <div class="spinner"></div>
      </div>
    </Transition>

    <!-- 顶部栏 -->
    <header class="header">
      <h1>afinit blog</h1>
      <div class="header-actions">
        <template v-if="isLoggedIn">
          <!-- 工具菜单 -->
          <div class="user-menu" ref="toolsMenuRef" @click.stop="showToolsDropdown = !showToolsDropdown; showDropdown = false">
            <span class="tools-btn-label">工具</span>
            <span class="dropdown-caret" :class="{ rotated: showToolsDropdown }">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <Transition name="dropdown">
              <div v-if="showToolsDropdown" class="dropdown-menu">
                <div class="dropdown-item" @click.stop="() => { showToolsDropdown = false; router.push('/upload') }">
                  Markdown 写作
                </div>
                <div class="dropdown-item" @click.stop="() => { showToolsDropdown = false; router.push('/generator') }">
                  项目构建器
                </div>
              </div>
            </Transition>
          </div>

          <!-- 用户头像菜单 -->
          <div class="user-menu" ref="userMenuRef" @click.stop="showDropdown = !showDropdown; showToolsDropdown = false">
            <div class="user-avatar">
              <img
                v-if="userInfo?.avatar"
                :key="`${userInfo.avatar}-${avatarCacheKey}`"
                :src="resolveAvatarUrl(userInfo.avatar)"
                :alt="userInfo?.nickname"
                class="avatar-img"
              />
              <span v-else class="avatar-letter">{{ avatarLetter }}</span>
            </div>
            <span class="user-nickname">{{ userInfo?.nickname || '用户' }}</span>
            <span class="dropdown-caret" :class="{ rotated: showDropdown }">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <Transition name="dropdown">
              <div v-if="showDropdown" class="dropdown-menu">
                <div class="dropdown-item" @click.stop="() => { showDropdown = false; router.push('/profile') }">
                  个人资料
                </div>
                <div class="dropdown-divider"></div>
                <div class="dropdown-item danger" @click.stop="logout">退出登录</div>
              </div>
            </Transition>
          </div>
        </template>
        <button v-else class="btn btn-outline" @click="router.push('/login')">登录</button>
      </div>
    </header>

    <!-- 标签页切换 (仅登录后显示) -->
    <div class="tabs-container" v-if="isLoggedIn">
      <div class="tabs">
        <button class="tab-btn" :class="{ active: currentTab === 'public' }" @click="switchTab('public')">最新发布</button>
        <button class="tab-btn" :class="{ active: currentTab === 'private' }" @click="switchTab('private')">
          {{ userInfo?.role === 1 ? '文章审核' : '待审核' }}
        </button>
        <button v-if="userInfo?.role === 1" class="tab-btn" :class="{ active: currentTab === 'users' }" @click="switchTab('users')">
          用户管理
        </button>
      </div>
    </div>

    <!-- 内容区域 -->
    <main class="content" data-nosnippet>
      <template v-if="currentTab === 'users'">
        <div v-if="adminUsersLoading && adminUsers.length === 0" class="status-msg">正在加载用户...</div>
        <div v-else-if="adminUsersError" class="status-msg error">{{ adminUsersError }}</div>
        <div v-else class="table-container">
          <table class="user-table">
            <thead>
              <tr>
                <th>ID</th>
                <th style="width: 50px;">头像</th>
                <th>昵称</th>
                <th>邮箱</th>
                <th>注册时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in adminUsers" :key="user.id">
                <td>{{ user.id }}</td>
                <td>
                  <div class="table-user-avatar">
                    <img v-if="user.avatar" :src="resolveAvatarUrl(user.avatar)" class="table-avatar-img" />
                    <span v-else class="table-avatar-letter">{{ (user.nickname || user.username || 'U').charAt(0).toUpperCase() }}</span>
                  </div>
                </td>
                <td>{{ user.nickname || user.username || '—' }}</td>
                <td>{{ user.email || '—' }}</td>
                <td>{{ formatTime(user.createTime) }}</td>
                <td>
                  <span :style="{ color: user.status !== 0 ? '#2e7d32' : '#d32f2f' }">
                    {{ user.status !== 0 ? '正常' : '已停用' }}
                  </span>
                </td>
                <td>
                  <div style="display: flex; gap: 8px;">
                    <button
                      class="btn btn-outline btn-sm"
                      :class="user.status !== 0 ? 'btn-warning' : 'btn-success'"
                      @click="blockAdminUser(user)"
                    >
                      {{ user.status !== 0 ? '停用' : '启用' }}
                    </button>
                    <button class="btn btn-outline btn-danger btn-sm" @click="deleteAdminUser(user)">删除</button>
                  </div>
                </td>
              </tr>
              <tr v-if="adminUsers.length === 0">
                <td colspan="5" class="empty-state">暂无用户数据</td>
              </tr>
            </tbody>
          </table>
          
          <div class="pagination" v-if="adminUserTotal > adminUserSize || adminUserPage > 1">
            <button class="btn btn-ghost btn-sm" :disabled="adminUserPage <= 1" @click="changeAdminUserPage(adminUserPage - 1)">上一页</button>
            <span class="page-info">第 {{ adminUserPage }} 页</span>
            <button class="btn btn-ghost btn-sm" :disabled="adminUsers.length < adminUserSize" @click="changeAdminUserPage(adminUserPage + 1)">下一页</button>
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="postsLoading" class="status-msg">正在加载文章...</div>
        <div v-else-if="postsError" class="status-msg error">{{ postsError }}</div>
        <div v-else-if="posts.length === 0" class="status-msg">暂无文章</div>
        <div v-else class="post-list">
          <article
            class="post-card"
            :class="{ 'post-card--self': userInfo && String(userInfo.id) === String(post.userId) }"
            v-for="post in posts"
            :key="post.id"
            @click="router.push(`/blog/${post.id}${currentTab === 'private' ? '?type=private' : ''}`)"
          >
            <h2 class="post-title">{{ post.title }}</h2>
            <p class="post-summary">{{ post.summary }}</p>
            <div class="post-meta">
              <span v-if="post.nickname">{{ post.nickname }}</span>
              <span>{{ post.createTime?.replace('T', ' ') }}</span>
              <span>阅读 {{ post.viewCount ?? 0 }}</span>
              <span>点赞 {{ post.likeCount ?? 0 }}</span>
              <div class="inline-actions" v-if="currentTab === 'private' && userInfo?.role === 1">
                <button class="btn btn-outline btn-success btn-xs" @click.stop="approvePost(post.id)">审核通过</button>
                <button class="btn btn-outline btn-danger btn-xs" @click.stop="deletePost(post.id)">删除</button>
              </div>
            </div>
          </article>
        </div>
      </template>
    </main>

    <!-- 独立提示弹窗 -->
    <div class="modal-overlay" v-if="customAlert.show">
      <div class="modal-content">
        <h3>提示</h3>
        <p>{{ customAlert.message }}</p>
        <div class="modal-actions">
          <button v-if="customAlert.isConfirm" class="btn btn-outline" @click="handleAlertCancel">取消</button>
          <button class="btn" :class="{ 'btn-danger': customAlert.isConfirm }" @click="handleAlertConfirm">确定</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }

.header {
  margin-bottom: 50px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 20px;
}
.header h1 { font-size: 24px; font-weight: 600; color: #111; margin: 0; letter-spacing: -0.5px; }
.header-actions { display: flex; align-items: center; gap: 16px; }

.btn { padding: 6px 14px; background-color: #111; color: #fff; border: 1px solid #111; border-radius: 4px; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.btn-outline { background-color: transparent; color: #111; border-color: #ccc; }
.btn-outline:hover { background-color: #f5f5f5; border-color: #111; }

.status-msg { text-align: center; color: #999; margin-top: 100px; font-size: 14px; }
.status-msg.error { color: #d32f2f; }

.tabs-container { margin-bottom: 24px; border-bottom: 1px solid #eaeaea; }
.tabs { display: flex; gap: 24px; }
.tab-btn { background: none; border: none; padding: 0 0 12px; font-size: 15px; color: #888; cursor: pointer; position: relative; font-weight: 500; transition: color 0.2s; }
.tab-btn:hover { color: #111; }
.tab-btn.active { color: #111; }
.tab-btn.active::after { content: ''; position: absolute; bottom: -1px; left: 0; width: 100%; height: 2px; background-color: #111; }

.post-list { display: flex; flex-direction: column; gap: 30px; }
.post-card {
  padding: 24px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: #fafafa;
}
.post-card--self { border: 2px solid #111; }
.post-card:hover { background-color: #f5f5f5; border-color: #eaeaea; transform: translateY(-2px); }
.post-card--self:hover { border-color: #111; background-color: #f5f5f5; }
.post-title  { font-size: 20px; font-weight: 600; color: #111; margin: 0 0 10px; }
.post-summary { font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 16px; }
.post-meta   { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; font-size: 12px; color: #999; }
.inline-actions { display: flex; gap: 8px; margin-left: auto; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-xs { padding: 2px 8px; font-size: 12px; border-radius: 4px; }
.btn-success { color: #2e7d32; border-color: #a5d6a7; }
.btn-success:hover { background-color: #e8f5e9; border-color: #2e7d32; color: #2e7d32; }
.btn-danger { color: #d32f2f; border-color: #ffcdd2; }
.btn-danger:hover { background-color: #ffebee; border-color: #d32f2f; color: #d32f2f; }
.btn-warning { color: #ed6c02; border-color: #ffcc80; }
.btn-warning:hover { background-color: #fff3e0; border-color: #ed6c02; color: #ed6c02; }

/* 弹窗样式 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(2px); }
.modal-content { background: #fff; padding: 32px; border-radius: 8px; width: 320px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); }
.modal-content h3 { margin: 0 0 12px 0; font-size: 18px; color: #111; font-weight: 600; }
.modal-content p { margin: 0 0 24px 0; font-size: 14px; color: #555; line-height: 1.5; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; }

.loading-overlay {
  position: fixed; inset: 0;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(2px);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
}
.spinner {
  width: 36px; height: 36px;
  border: 3px solid #e0e0e0; border-top-color: #111;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.user-menu {
  position: relative;
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 10px 5px 5px;
  border-radius: 6px; border: 1px solid #e8e8e8;
  cursor: pointer; user-select: none;
  transition: background 0.2s, border-color 0.2s;
}
.user-menu:hover { background: #f5f5f5; border-color: #d0d0d0; }
.tools-btn-label { font-size: 13px; color: #111; font-weight: 500; padding-left: 5px; }

.user-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: #111; overflow: hidden; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.avatar-img    { width: 100%; height: 100%; object-fit: cover; }
.avatar-letter { color: #fff; font-size: 12px; font-weight: 600; }

.user-nickname {
  font-size: 13px; color: #111; font-weight: 500;
  max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.dropdown-caret { color: #aaa; display: flex; align-items: center; transition: transform 0.2s; }
.dropdown-caret.rotated { transform: rotate(180deg); }

.dropdown-menu {
  position: absolute; top: calc(100% + 6px); right: 0;
  background: #fff; border: 1px solid #ececec; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.09); min-width: 130px;
  z-index: 200; overflow: hidden;
}
.dropdown-item { padding: 10px 16px; font-size: 13px; color: #333; cursor: pointer; transition: background 0.15s; white-space: nowrap; }
.dropdown-item:hover { background: #f5f5f5; }
.dropdown-item.danger { color: #d32f2f; }
.dropdown-item.danger:hover { background: #fff5f5; }
.dropdown-divider { height: 1px; background: #f0f0f0; }

.dropdown-enter-active, .dropdown-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }

/* 用户管理表格样式 */
.table-container { overflow-x: auto; background: #fff; border-radius: 8px; border: 1px solid #eaeaea; padding: 20px; }
.user-table { width: 100%; border-collapse: collapse; }
.user-table th { padding: 12px 16px; text-align: left; background: #f9f9f9; color: #555; font-weight: 600; font-size: 14px; border-bottom: 2px solid #eaeaea; white-space: nowrap; }
.user-table td { padding: 12px 16px; border-bottom: 1px solid #eaeaea; color: #333; font-size: 14px; vertical-align: middle; white-space: nowrap; }
.table-user-avatar { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #333, #666); color: #fff; font-weight: 600; font-size: 14px; flex-shrink: 0; }
.table-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.table-avatar-letter { display: inline-block; line-height: 1; }
.empty-state { text-align: center; color: #999; padding: 40px !important; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 20px; }
.page-info { font-size: 14px; color: #555; }
.btn-ghost { background: transparent; color: #555; border-color: #ddd; }
.btn-ghost:hover:not(:disabled) { background: #f5f5f5; border-color: #bbb; color: #111; }
</style>
