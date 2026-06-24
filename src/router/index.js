import { createRouter, createWebHashHistory } from 'vue-router'
import { refreshHomeData } from '../composables/useHomeRefresh.js'
import BlogList from '../views/BlogList.vue'
import ArticleDetail from '../views/ArticleDetail.vue'
import UploadTool from '../views/UploadTool.vue'
import Login from '../views/Login.vue'
import UserProfile from '../views/UserProfile.vue'
import Register from '../views/Register.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: BlogList
    },
    {
      path: '/blog/:id',
      name: 'postDetail',
      component: ArticleDetail
    },
    {
      path: '/upload',
      name: 'upload',
      component: UploadTool
    },
    {
      path: '/login',
      name: 'login',
      component: Login
    },
    {
      path: '/register',
      name: 'register',
      component: Register
    },
    {
      path: '/profile',
      name: 'profile',
      component: UserProfile
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

router.afterEach((to, from) => {
  if (to.name === 'home' && from.name !== 'home') {
    refreshHomeData()
  }
})

export default router
