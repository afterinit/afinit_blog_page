<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import logoLight from '@/assets/images/loolc-logo.png'
import logoDark from '@/assets/images/loolc-logo-dark.png'
import { appConfig } from '@/config/app.js'
import { ROUTE_NAMES } from '@/constants/routes.js'
import { useTheme } from '@/composables/useTheme.js'

const props = defineProps({
  isLoggedIn: { type: Boolean, default: false },
  userInfo: { type: Object, default: null },
  avatarUrl: { type: String, default: '' },
  avatarLetter: { type: String, default: 'U' },
  avatarCacheKey: { type: Number, default: 0 },
})

const emit = defineEmits(['logout'])
const router = useRouter()
const { currentTheme } = useTheme()
const showUserMenu = ref(false)
const showToolsMenu = ref(false)
const userMenuRef = ref(null)
const toolsMenuRef = ref(null)
const contactHref = computed(() => `mailto:${appConfig.contactEmail}`)

function goTo(name) {
  showUserMenu.value = false
  showToolsMenu.value = false
  router.push({ name })
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
  showToolsMenu.value = false
}

function toggleToolsMenu() {
  showToolsMenu.value = !showToolsMenu.value
  showUserMenu.value = false
}

function logout() {
  showUserMenu.value = false
  emit('logout')
}

function onOutsideClick(event) {
  if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
    showUserMenu.value = false
  }
  if (toolsMenuRef.value && !toolsMenuRef.value.contains(event.target)) {
    showToolsMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', onOutsideClick))
onUnmounted(() => document.removeEventListener('click', onOutsideClick))
</script>

<template>
  <header class="app-header">
    <button
      type="button"
      class="brand-home"
      :aria-label="`返回 ${appConfig.name} 首页`"
      @click="goTo(ROUTE_NAMES.HOME)"
    >
      <span class="brand-logo-frame" aria-hidden="true">
        <img v-show="currentTheme === 'light'" :src="logoLight" alt="" class="brand-logo" />
        <img v-show="currentTheme === 'dark'" :src="logoDark" alt="" class="brand-logo" />
      </span>
    </button>

    <nav class="header-actions" aria-label="站点功能">
      <a :href="contactHref" class="contact-link" :title="appConfig.contactEmail" aria-label="联系作者">
        <svg class="contact-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2"></rect>
          <path d="m3 7 9 6 9-6"></path>
        </svg>
        <span class="contact-label">联系作者</span>
      </a>

      <ThemeToggle />

      <template v-if="props.isLoggedIn">
        <button type="button" class="user-menu nav-button" @click="goTo(ROUTE_NAMES.UPLOAD)">
          <span class="tools-btn-label">发布文章</span>
        </button>

        <div ref="toolsMenuRef" class="user-menu" @click.stop="toggleToolsMenu">
          <span class="tools-btn-label">工具</span>
          <span class="dropdown-caret" :class="{ rotated: showToolsMenu }">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <Transition name="dropdown">
            <div v-if="showToolsMenu" class="dropdown-menu">
              <button type="button" class="dropdown-item" @click.stop="goTo(ROUTE_NAMES.GENERATOR)">项目构建器</button>
            </div>
          </Transition>
        </div>

        <div ref="userMenuRef" class="user-menu" @click.stop="toggleUserMenu">
          <span class="user-avatar">
            <img
              v-if="props.avatarUrl"
              :key="`${props.userInfo?.avatar}-${props.avatarCacheKey}`"
              :src="props.avatarUrl"
              :alt="props.userInfo?.nickname || '用户头像'"
              class="avatar-img"
            />
            <span v-else class="avatar-letter">{{ props.avatarLetter }}</span>
          </span>
          <span class="user-nickname">{{ props.userInfo?.nickname || '用户' }}</span>
          <span class="dropdown-caret" :class="{ rotated: showUserMenu }">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <Transition name="dropdown">
            <div v-if="showUserMenu" class="dropdown-menu">
              <button type="button" class="dropdown-item" @click.stop="goTo(ROUTE_NAMES.PROFILE)">个人资料</button>
              <div class="dropdown-divider"></div>
              <button type="button" class="dropdown-item danger" @click.stop="logout">退出登录</button>
            </div>
          </Transition>
        </div>
      </template>

      <button v-else type="button" class="login-button" @click="goTo(ROUTE_NAMES.LOGIN)">登录</button>
    </nav>
  </header>
</template>

<style scoped>
.app-header {
  margin-bottom: 50px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 20px;
}
.brand-home {
  flex: 0 0 auto;
  padding: 5px 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 0;
}
.brand-logo-frame {
  display: block;
  width: 168px;
  aspect-ratio: 3 / 1;
  transition: transform 0.2s ease;
}
.brand-logo { display: block; width: 100%; height: auto; }
.brand-home:hover .brand-logo-frame { transform: translateY(-1px); }
.brand-home:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 6px; }

.header-actions { display: flex; align-items: center; gap: 16px; }
.contact-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 14px;
  text-decoration: none;
  transition: color 0.2s;
  white-space: nowrap;
}
.contact-link:hover { color: var(--text-primary); }
.contact-icon { display: none; flex: 0 0 auto; }

.login-button,
.nav-button {
  font: inherit;
}
.login-button {
  padding: 6px 14px;
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.login-button:hover { background: var(--bg-hover); border-color: var(--text-primary); }

.user-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px 5px 5px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s, border-color 0.2s;
}
.user-menu:hover { background: var(--bg-hover); border-color: var(--text-secondary); }
.nav-button { padding: 5px 10px; }
.tools-btn-label { padding-left: 5px; color: var(--text-primary); font-size: 13px; font-weight: 500; }
.nav-button .tools-btn-label { padding-left: 0; }
.user-avatar {
  width: 28px;
  height: 28px;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 50%;
}
.avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.avatar-letter { color: var(--text-primary); font-size: 12px; font-weight: 600; }
.user-nickname {
  max-width: 90px;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dropdown-caret { display: flex; align-items: center; color: var(--text-secondary); transition: transform 0.2s; }
.dropdown-caret.rotated { transform: rotate(180deg); }
.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 130px;
  overflow: hidden;
  z-index: 200;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}
.dropdown-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  transition: background 0.15s;
}
.dropdown-item:hover { background: var(--bg-hover); }
.dropdown-item.danger { color: var(--danger-color); }
.dropdown-item.danger:hover { background: rgba(255, 77, 79, 0.1); }
.dropdown-divider { height: 1px; background: var(--border-color); }
.dropdown-enter-active, .dropdown-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 768px) {
  .app-header { flex-wrap: nowrap; gap: 8px; margin-bottom: 28px; padding-bottom: 16px; }
  .brand-home { padding: 4px 0; }
  .brand-logo-frame { width: 108px; }
  .header-actions { width: auto; min-width: 0; margin-left: auto; flex-wrap: nowrap; gap: 6px; justify-content: flex-end; }
  .contact-link { font-size: 13px; }
  .user-nickname { display: none; }
}

@media (max-width: 480px) {
  .brand-logo-frame { width: 84px; }
  .header-actions { gap: 4px; }
  .contact-link { width: 38px; height: 38px; justify-content: center; }
  .contact-icon { display: block; }
  .contact-label { display: none; }
  .header-actions :deep(.theme-toggle-btn) { width: 38px; height: 38px; min-width: 38px; min-height: 38px; padding: 8px; }
  .user-menu { gap: 4px; padding: 4px 6px; }
  .tools-btn-label { padding-left: 0; font-size: 12px; }
}
</style>
