# LOOLC Blog

基于 Vue 3、Vue Router 和 Vite 的博客前端。

## 本地开发

```sh
npm install
npm run dev
```

开发环境默认运行在站点根路径 `/`，API 地址由 `.env.development` 配置。

## 生产构建

```sh
npm run build
```

生产环境构建到 `dist/`，站点挂载路径由 `.env.production` 中的
`VITE_APP_BASE` 配置，当前为 `/blog/`。

服务器需要把 `/blog/` 下无法匹配到静态文件的请求回退到
`/blog/index.html`，以支持 Vue Router history 模式的页面刷新。

## 常用命令

```sh
npm run dev      # 启动开发服务器
npm run build    # 生成生产构建
npm run preview  # 本地预览生产构建
```
