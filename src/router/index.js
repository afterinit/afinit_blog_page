import { createRouter, createWebHistory } from 'vue-router'
import BlogList from '../views/BlogList.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: BlogList
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('../views/UploadTool.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/Login.vue')
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/Register.vue')
    },
    {
      path: '/forgot-password',
      name: 'forgotPassword',
      component: () => import('../views/ForgotPassword.vue')
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/UserProfile.vue')
    },
    {
      path: '/generator',
      name: 'generator',
      component: () => import('../views/shelf/ProjectGenerator.vue')
    },
    {
      path: '/:id',
      name: 'postDetail',
      component: () => import('../views/ArticleDetail.vue')
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
