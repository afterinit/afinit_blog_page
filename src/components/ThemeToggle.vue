<script setup>
import { useTheme } from '../composables/useTheme.js'
const { currentTheme, toggleTheme } = useTheme()
</script>

<template>
  <button
    type="button"
    class="theme-toggle-btn"
    @click="toggleTheme($event)"
    :title="currentTheme === 'dark' ? '切换浅色' : '切换深色'"
    :aria-label="currentTheme === 'dark' ? '切换浅色' : '切换深色'"
  >
    <!-- Sun icon for dark mode (click to switch to light) -->
    <svg v-if="currentTheme === 'dark'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
    <!-- Moon icon for light mode (click to switch to dark) -->
    <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  padding: 8px;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 50% !important;
  transition: transform 0.3s, color 0.3s, background 0.2s;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.theme-toggle-btn:hover {
  transform: rotate(15deg);
}
.theme-toggle-btn:active {
  transform: scale(0.94);
}

@media (max-width: 768px) {
  .theme-toggle-btn {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 10px;
  }
  .theme-toggle-btn:hover {
    transform: none;
  }
}
</style>
