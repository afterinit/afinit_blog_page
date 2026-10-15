# LOOLC Blog

基于 Vue 3、Vue Router 和 Vite 的博客前端。

## 本地开发

```sh
npm install
npm run dev
```

开发环境默认运行在站点根路径 `/`，API 地址由 `.env.development` 配置。

通用站点信息统一放在 `.env`，包括站点名称、SEO 信息、联系邮箱、
本地存储前缀和 Turnstile Site Key。环境文件只保留各环境真正不同的配置。

## 生产构建

```sh
npm run build
```

生产环境构建到 `dist/`，站点挂载路径由 `.env.production` 中的
`VITE_APP_BASE` 配置，当前为 `/blog/`。

服务器需要把 `/blog/` 下无法匹配到静态文件的请求回退到
`/blog/index.html`，以支持 Vue Router history 模式的页面刷新。

## 项目结构

```text
src/
├─ api/          # 后端接口与统一请求封装
├─ assets/       # 全局样式和图片资源
├─ components/   # common、layout、user 等可复用组件
├─ composables/  # Vue 组合式状态与页面协作逻辑
├─ config/       # 应用和 HTTP 配置
├─ constants/    # 路由名、存储键等稳定常量
├─ router/       # 路由注册
├─ utils/        # 无界面依赖的通用工具
└─ views/        # 路由页面
```

页面跳转统一使用 `constants/routes.js` 中的路由名；站点配置通过
`config/app.js` 读取；JSON 请求头和序列化由 `api/base.js` 统一处理。

## 常用命令

```sh
npm run dev      # 启动开发服务器
npm run build    # 生成生产构建
npm run preview  # 本地预览生产构建
```
