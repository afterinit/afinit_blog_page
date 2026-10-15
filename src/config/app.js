const env = import.meta.env

export const appConfig = Object.freeze({
  name: env.VITE_SITE_NAME || 'LOOLC',
  contactEmail: env.VITE_CONTACT_EMAIL || '',
  apiBaseUrl: env.VITE_API_BASE_URL || '',
  baseUrl: env.BASE_URL,
  storagePrefix: env.VITE_STORAGE_PREFIX || 'afinit',
  turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY || '',
  defaultTheme: 'dark',
})

export const uiConfig = Object.freeze({
  mobileThemeMediaQuery: '(max-width: 768px), (pointer: coarse), (hover: none)',
})
