<script setup>
import { ref, reactive, onMounted, onUnmounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import SHA256 from 'crypto-js/sha256'
import { registerHomeRefresh } from '../composables/useHomeRefresh.js'
import { useDialog } from '../composables/useDialog.js'
import { removeToken, hasAuthSession } from '../utils/auth.js'
import { useUserInfo } from '../composables/useUserInfo.js'
import { useTheme } from '../composables/useTheme.js'
import ThemeToggle from '../components/ThemeToggle.vue'
import { AuthError } from '../utils/request.js'
import { blogApi } from '../api/blog.js'
import { userApi } from '../api/user.js'
import { adminApi } from '../api/admin.js'

defineOptions({ name: 'BlogList' })

const { currentTheme, toggleTheme } = useTheme()


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

const postsPage    = ref(1)
const postsSize    = ref(10)
const postsTotal   = ref(0)

async function fetchPosts(silent = false) {
  if (!silent) postsLoading.value = true
  postsError.value   = ''
  try {
    // 管理员「文章审核」走 /blog/private，普通用户「待审核」走 /blog/personal
    const scope = currentTab.value === 'private'
      ? (userInfo.value?.role === 1 ? 'private' : 'personal')
      : 'public'
    const res = await blogApi.getBlogList(postsPage.value, postsSize.value, scope)
    const data = res.data
    posts.value = Array.isArray(data) ? data : (data?.records ?? [])
    postsTotal.value = data?.total || 0
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

function changePostsPage(p) {
  if (p < 1) return
  postsPage.value = p
  fetchPosts()
}

function switchTab(tab) {
  if (currentTab.value === tab) return
  currentTab.value = tab
  postsPage.value = 1
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
    const res = await adminApi.getUsers(adminUserPage.value, adminUserSize.value)
    adminUsers.value = res.data?.records || res.data?.items || res.data || []
    adminUserTotal.value = res.data?.total || 0
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
      await userApi.deleteUser(user.id)
      showAlert('注销成功！')
      fetchAdminUsers()
    } catch (err) {
      if (!err.isAuthError) showAlert(`注销失败：${err.message}`)
    }
  })
}

function blockAdminUser(user) {
  const isNormal = user.status !== 0;
  const targetStatus = isNormal ? 0 : 1;
  const actionName = isNormal ? '停用' : '启用';

  showConfirm(`确定要${actionName}用户 ${user.id || user.nickname} 吗？`, async () => {
    try {
      await adminApi.updateUserStatus(user.id, targetStatus)
      showAlert(`${actionName}成功！`)
      fetchAdminUsers()
    } catch (err) {
      if (!err.isAuthError) showAlert(`${actionName}失败：${err.message}`)
    }
  })
}

import { formatLocalTime } from '../utils/timeFormat.js'

function formatTime(raw) {
  return formatLocalTime(raw)
}

function useEditAdminUser() {
  const show = ref(false)
  const form = reactive({ id: '', username: '', email: '', password: '' })
  const loading = ref(false)
  
  function open(user) {
    form.id = user.id
    form.username = user.username || ''
    form.email = user.email || ''
    form.password = ''
    show.value = true
  }
  
  function close() {
    show.value = false
  }
  
  async function submit() {
    loading.value = true
    try {
      const body = { id: form.id }
      if (form.username.trim()) body.username = form.username.trim()
      if (form.email.trim()) body.email = form.email.trim()
      if (form.password) body.password = SHA256(form.password).toString()

      await userApi.updateUserInfo(body)
      showAlert('修改成功！')
      show.value = false
      fetchAdminUsers()
    } catch (err) {
      if (!err.isAuthError) showAlert(`修改失败：${err.message}`)
    } finally {
      loading.value = false
    }
  }

  return { show, form, loading, open, close, submit }
}
const editAdminUser = useEditAdminUser()



// ─── 弹窗 ──────────────────────────────────────────────────────────────────────

// ─── 审核文章 ──────────────────────────────────────────────────────────────────

async function approvePost(id) {
  try {
    const res = await adminApi.publishBlog(id)
    posts.value = posts.value.filter(p => p.id !== id)
    fetchPosts(true)
    showAlert(res.msg || res.message || '更新成功！')
  } catch (err) {
    if (!err.isAuthError) showAlert(`审核失败：${err.message}`)
  }
}

function deletePost(id) {
  showConfirm('确定要删除这篇文章吗？此操作不可恢复。', async () => {
    try {
      const res = await blogApi.deleteBlog(id)
      posts.value = posts.value.filter(p => p.id !== id)
      fetchPosts(true)
      showAlert(res.msg || res.message || '删除成功！')
    } catch (err) {
      if (!err.isAuthError) showAlert(`删除失败：${err.message}`)
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
        <a href="mailto:afinit@afinit.top" class="contact-link" title="afinit@afinit.top">联系作者</a>
        <ThemeToggle />
        <template v-if="isLoggedIn">
          <!-- 发布文章按钮 -->
          <div class="user-menu" @click="router.push('/upload')" style="padding: 5px 10px;">
            <span class="tools-btn-label" style="padding-left: 0;">发布文章</span>
          </div>
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
        <template v-else>
          <button class="btn btn-outline" @click="router.push('/login')">登录</button>
        </template>
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
                <th>昵称 / 用户名</th>
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
                <td>
                  <div style="font-weight: 500; color: var(--text-primary);">{{ user.nickname || '未设置昵称' }}</div>
                  <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">@{{ user.username || '—' }}</div>
                </td>
                <td style="color: var(--text-secondary);">{{ user.email || '—' }}</td>
                <td>{{ formatTime(user.createTime) }}</td>
                <td>
                  <span :style="{ color: user.status !== 0 ? 'var(--success-color)' : 'var(--danger-color)' }">
                    {{ user.status !== 0 ? '正常' : '已停用' }}
                  </span>
                </td>
                <td>
                  <div style="display: flex; gap: 8px;">
                    <button class="btn btn-outline btn-sm" @click="editAdminUser.open(user)">编辑</button>
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
            @click="router.push(`/blog/${post.id}${currentTab === 'private' ? (userInfo?.role === 1 ? '?type=private' : '?type=personal') : ''}`)"
          >
            <h2 class="post-title">{{ post.title }}</h2>
            <p class="post-summary">{{ post.summary }}</p>
            <div class="post-meta">
              <span v-if="post.nickname">{{ post.nickname }}</span>
              <span>{{ formatTime(post.createTime) }}</span>
              <span>阅读 {{ post.viewCount ?? 0 }}</span>
              <span>点赞 {{ post.likeCount ?? 0 }}</span>
              <div class="inline-actions" v-if="currentTab === 'private' && userInfo?.role === 1">
                <button class="btn btn-outline btn-success btn-xs" @click.stop="approvePost(post.id)">审核通过</button>
                <button class="btn btn-outline btn-danger btn-xs" @click.stop="deletePost(post.id)">删除</button>
              </div>
            </div>
          </article>
        </div>
        
        <div class="pagination" v-if="postsTotal > postsSize || postsPage > 1">
          <button class="btn btn-ghost btn-sm" :disabled="postsPage <= 1" @click="changePostsPage(postsPage - 1)">上一页</button>
          <span class="page-info">第 {{ postsPage }} 页</span>
          <button class="btn btn-ghost btn-sm" :disabled="posts.length < postsSize" @click="changePostsPage(postsPage + 1)">下一页</button>
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

    <!-- 编辑用户弹窗 -->
    <div class="modal-overlay" v-if="editAdminUser.show.value">
      <div class="modal-content">
        <h3>编辑用户信息</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
          <div>
            <label style="font-size: 13px; color: #555; display: block; margin-bottom: 4px;">用户名</label>
            <input v-model="editAdminUser.form.username" type="text" class="input-field" placeholder="留空则不修改" />
          </div>
          <div>
            <label style="font-size: 13px; color: #555; display: block; margin-bottom: 4px;">邮箱</label>
            <input v-model="editAdminUser.form.email" type="email" class="input-field" placeholder="邮箱" />
          </div>
          <div>
            <label style="font-size: 13px; color: #555; display: block; margin-bottom: 4px;">新密码</label>
            <input v-model="editAdminUser.form.password" type="password" class="input-field" placeholder="留空则不修改" />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" @click="editAdminUser.close" :disabled="editAdminUser.loading.value">取消</button>
          <button class="btn" @click="editAdminUser.submit" :disabled="editAdminUser.loading.value">{{ editAdminUser.loading.value ? '保存中...' : '确定' }}</button>
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
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 20px;
}
.header h1 { font-size: 24px; font-weight: 600; color: var(--text-primary); margin: 0; letter-spacing: -0.5px; }
.header-actions { display: flex; align-items: center; gap: 16px; }

.contact-link { font-size: 14px; color: var(--text-secondary); text-decoration: none; transition: color 0.2s; }
.contact-link:hover { color: var(--text-primary); }

.btn { padding: 6px 14px; background-color: var(--text-primary); color: var(--bg-primary); border: 1px solid var(--text-primary); font-size: 13px; cursor: pointer; transition: all 0.2s; }
.btn:hover:not(:disabled) { background-color: var(--accent-hover); border-color: var(--accent-hover); }
.btn-outline { background-color: transparent; color: var(--text-primary); border-color: var(--border-color); }
.btn-outline:hover:not(:disabled) { background-color: var(--bg-hover); border-color: var(--text-primary); }

.status-msg { text-align: center; color: var(--text-secondary); margin-top: 100px; font-size: 14px; }
.status-msg.error { color: var(--danger-color); }

.tabs-container { margin-bottom: 0; border-bottom: 1px solid var(--border-color); }
.tabs { display: flex; gap: 24px; }
.tab-btn { background: none; border: none; padding: 0 0 12px; font-size: 15px; color: var(--text-secondary); cursor: pointer; position: relative; font-weight: 500; transition: color 0.2s; }
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active { color: var(--text-primary); }
.tab-btn.active::after { content: ''; position: absolute; bottom: -1px; left: 0; width: 100%; height: 2px; background-color: var(--text-primary); }

.post-list { display: flex; flex-direction: column; gap: 0; }
.post-card {
  padding: 24px 16px;
  border: none;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: transparent;
}
.post-card--self { border-left: 2px solid var(--text-primary); }
.post-card:hover { background-color: var(--bg-hover); }
.post-card--self:hover { background-color: var(--bg-hover); }
.post-title  { font-size: 18px; font-weight: 600; color: var(--text-primary); margin: 0 0 8px; }
.post-summary { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin: 0 0 16px; }
.post-meta   { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--text-secondary); opacity: 0.8; }
.inline-actions { display: flex; gap: 8px; margin-left: auto; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-xs { padding: 2px 8px; font-size: 12px; }
.btn-success { color: var(--success-color); border-color: var(--success-color); }
.btn-success:hover { background-color: rgba(82, 196, 26, 0.1); border-color: var(--success-color); color: var(--success-color); }
.btn-danger { color: var(--danger-color); border-color: var(--danger-color); }
.btn-danger:hover { background-color: rgba(255, 77, 79, 0.1); border-color: var(--danger-color); color: var(--danger-color); }
.btn-warning { color: #ed6c02; border-color: #ffcc80; }
.btn-warning:hover { background-color: rgba(237, 108, 2, 0.1); border-color: #ed6c02; color: #ed6c02; }

/* 弹窗样式 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(2px); }
.modal-content { background: var(--bg-secondary); padding: 32px; width: 320px; border: 1px solid var(--border-color); }
.modal-content h3 { margin: 0 0 12px 0; font-size: 18px; color: var(--text-primary); font-weight: 600; }
.modal-content p { margin: 0 0 24px 0; font-size: 14px; color: var(--text-secondary); line-height: 1.5; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; }

.loading-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(2px);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
}
.spinner {
  width: 36px; height: 36px;
  border: 3px solid #333; border-top-color: var(--text-primary);
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
  border: 1px solid var(--border-color);
  cursor: pointer; user-select: none;
  transition: background 0.2s, border-color 0.2s;
}
.user-menu:hover { background: var(--bg-hover); border-color: var(--text-secondary); }
.tools-btn-label { font-size: 13px; color: var(--text-primary); font-weight: 500; padding-left: 5px; }

.user-avatar {
  width: 28px; height: 28px;
  background: var(--bg-secondary); overflow: hidden; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 50%;
}
.avatar-img    { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.avatar-letter { color: var(--text-primary); font-size: 12px; font-weight: 600; }

.user-nickname {
  font-size: 13px; color: var(--text-primary); font-weight: 500;
  max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.dropdown-caret { color: var(--text-secondary); display: flex; align-items: center; transition: transform 0.2s; }
.dropdown-caret.rotated { transform: rotate(180deg); }

.dropdown-menu {
  position: absolute; top: calc(100% + 6px); right: 0;
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  min-width: 130px;
  z-index: 200; overflow: hidden;
}
.dropdown-item { padding: 10px 16px; font-size: 13px; color: var(--text-primary); cursor: pointer; transition: background 0.15s; white-space: nowrap; }
.dropdown-item:hover { background: var(--bg-hover); }
.dropdown-item.danger { color: var(--danger-color); }
.dropdown-item.danger:hover { background: rgba(255, 77, 79, 0.1); }
.dropdown-divider { height: 1px; background: var(--border-color); }

.dropdown-enter-active, .dropdown-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }

.input-field { width: 100%; padding: 8px 12px; background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); font-size: 14px; box-sizing: border-box; }
.input-field:focus { border-color: var(--text-primary); outline: none; }

/* 用户管理表格样式 */
.table-container { overflow-x: auto; background: transparent; border: 1px solid var(--border-color); padding: 20px; }
.user-table { width: 100%; border-collapse: collapse; }
.user-table th { padding: 12px 16px; text-align: left; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 600; font-size: 14px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.user-table td { padding: 12px 16px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-size: 14px; vertical-align: middle; white-space: nowrap; }
.table-user-avatar { width: 32px; height: 32px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 50%; color: var(--text-primary); font-weight: 600; font-size: 14px; flex-shrink: 0; }
.table-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.table-avatar-letter { display: inline-block; line-height: 1; }
.empty-state { text-align: center; color: var(--text-secondary); padding: 40px !important; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 20px; }
.page-info { font-size: 14px; color: var(--text-secondary); }
.btn-ghost { background: transparent; color: var(--text-secondary); border-color: var(--border-color); }
.btn-ghost:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--text-secondary); color: var(--text-primary); }

@media (max-width: 768px) {
  .container { padding: 20px 16px 40px; }
  .header {
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 28px;
    padding-bottom: 16px;
    align-items: flex-start;
  }
  .header h1 { font-size: 20px; }
  .header-actions {
    width: 100%;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
  }
  .contact-link { font-size: 13px; margin-right: auto; }
  .user-nickname { display: none; }
  .tabs { gap: 16px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tab-btn { font-size: 14px; white-space: nowrap; flex-shrink: 0; }
  .post-card { padding: 18px 8px; }
  .post-title { font-size: 16px; }
  .inline-actions { width: 100%; margin-left: 0; margin-top: 4px; }
}
</style>
