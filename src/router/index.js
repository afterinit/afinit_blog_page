import { createRouter, createWebHistory } from 'vue-router'
import BlogList from '@/views/BlogList.vue'
import ProjectGenerator from '@/views/ProjectGenerator.vue'
import { ROUTE_NAMES, ROUTE_PATHS } from '@/constants/routes.js'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: ROUTE_PATHS.HOME,
      name: ROUTE_NAMES.HOME,
      component: BlogList
    },
    {
      path: ROUTE_PATHS.UPLOAD,
      name: ROUTE_NAMES.UPLOAD,
      component: () => import('@/views/UploadTool.vue')
    },
    {
      path: ROUTE_PATHS.LOGIN,
      name: ROUTE_NAMES.LOGIN,
      component: () => import('@/views/Login.vue')
    },
    {
      path: ROUTE_PATHS.REGISTER,
      name: ROUTE_NAMES.REGISTER,
      component: () => import('@/views/Register.vue')
    },
    {
      path: ROUTE_PATHS.FORGOT_PASSWORD,
      name: ROUTE_NAMES.FORGOT_PASSWORD,
      component: () => import('@/views/ForgotPassword.vue')
    },
    {
      path: ROUTE_PATHS.PROFILE,
      name: ROUTE_NAMES.PROFILE,
      component: () => import('@/views/UserProfile.vue')
    },
    {
      path: ROUTE_PATHS.GENERATOR,
      name: ROUTE_NAMES.GENERATOR,
      component: ProjectGenerator
    },
    {
      path: ROUTE_PATHS.POST_DETAIL,
      name: ROUTE_NAMES.POST_DETAIL,
      component: () => import('@/views/ArticleDetail.vue')
    }
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

export default router
