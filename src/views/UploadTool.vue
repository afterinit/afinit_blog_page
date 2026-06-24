<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { parseMdToJson, processHtml, marked } from '../utils/mdParser.js'
import { parseJsonSafe, extractDataIdFromJsonText } from '../utils/json.js'
import { assertApiSuccess, getApiSuccessMessage } from '../utils/apiResponse.js'
import { refreshHomePosts } from '../composables/useHomeRefresh.js'
import { useDialog } from '../composables/useDialog.js'
import request, { AuthError } from '../utils/request.js'

const router = useRouter()
const mode = ref('md2json')
const inputText = ref('')
const fileInput = ref(null)
const {
  dialog: customAlert,
  showDialog: showAlert,
  confirmDialog: handleAlertConfirm,
} = useDialog()

const mdToJsonResult = computed(() => {
  if (mode.value !== 'md2json' || !inputText.value.trim()) return ''
  try {
    const jsonObj = parseMdToJson(inputText.value)
    return JSON.stringify(jsonObj, null, 2)
  } catch (e) {
    return `解析出错: ${e.message}`
  }
})

const articleData = computed(() => {
  if (mode.value !== 'json2md' || !inputText.value.trim()) return null
  try {
    const parsed = JSON.parse(inputText.value)
    const data = parsed.data ? parsed.data : parsed
    
    let dateStr = data.createTime || ''
    if (dateStr) dateStr = dateStr.replace('T', ' ')

    let htmlRaw = marked.parse(data.content || '');
    if (typeof htmlRaw !== 'string') {
        htmlRaw = String(htmlRaw);
    }
    const htmlSafe = processHtml(htmlRaw);

    return {
      title: data.title || '未命名标题',
      summary: data.summary || '',
      summaryHtml: data.summary ? processHtml(marked.parseInline(data.summary)) : '',
      date: dateStr,
      viewCount: data.viewCount || 0,
      likeCount: data.likeCount || 0,
      htmlContent: htmlSafe
    }
  } catch (e) {
    return { error: '解析出错: 请确保输入的是合法的 JSON 数据' }
  }
})

function setMode(newMode) {
  mode.value = newMode
  inputText.value = ''
}

function handleDrop(e) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file) readFile(file)
}

function handleFileSelect(e) {
  const file = e.target.files[0]
  if (file) readFile(file)
  e.target.value = ''
}

function readFile(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    inputText.value = e.target.result
  }
  reader.readAsText(file)
}

async function copyOutput() {
  if (!mdToJsonResult.value || mdToJsonResult.value.startsWith('解析出错')) return
  try {
    await navigator.clipboard.writeText(mdToJsonResult.value)
    showAlert('复制成功')
  } catch (err) {
    showAlert('复制失败')
  }
}

async function publishArticle() {
  if (!mdToJsonResult.value || mdToJsonResult.value.startsWith('解析出错')) {
    showAlert('没有可发布的有效内容');
    return;
  }
  
  try {
    const parsedData = JSON.parse(mdToJsonResult.value);
    
    const apiUrl = import.meta.env.VITE_API_BASE_URL;
    const response = await request(`${apiUrl}/blog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: parsedData.title,
        summary: parsedData.summary,
        content: parsedData.content
      })
    });
    
    const resText = await response.text()
    const newId = extractDataIdFromJsonText(resText)
    const res = parseJsonSafe(resText)
    assertApiSuccess(response, res, [20011], '发布失败');

    refreshHomePosts()

    showAlert(getApiSuccessMessage(res, '发布成功！'), () => {
      // 跳转到新发布的文章详情页，优先使用正则抠出来的精准字符串 ID
      if (newId) {
        router.push(`/blog/${newId}`);
      } else if (res.data) {
        router.push(`/blog/${res.data}`);
      } else {
        router.push('/');
      }
    });
    
  } catch (err) {
    if (err.isAuthError) return
    showAlert(err.message);
  }
}
</script>

<template>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <button class="back-btn" @click="router.push('/')">← 返回列表</button>
        <h1>工具箱</h1>
      </div>
      <div class="tabs">
        <button class="tab" :class="{ active: mode === 'md2json' }" @click="setMode('md2json')">MD 转 JSON</button>
        <button class="tab" :class="{ active: mode === 'json2md' }" @click="setMode('json2md')">JSON 预览</button>
      </div>
    </div>

    <div class="editor-container">
      <!-- 输入区 -->
      <div class="editor-pane">
        <div class="pane-header">
          <span>输入 (单文本框，自动解析)</span>
          <button class="btn btn-sm btn-outline" @click="fileInput.click()">选择文件</button>
          <input ref="fileInput" type="file" style="display: none" @change="handleFileSelect" />
        </div>
        <textarea 
          class="text-input" 
          v-model="inputText" 
          :placeholder="mode === 'md2json' ? '在此粘贴包含 # 标题 和 摘要 的完整 Markdown 文本...' : '在此粘贴后端返回的 JSON 数据...'"
          @dragover.prevent
          @drop="handleDrop"
        ></textarea>
      </div>

      <!-- 输出区 (MD转JSON) -->
      <div class="editor-pane" v-if="mode === 'md2json'">
        <div class="pane-header">
          <span>JSON 结果</span>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-outline" @click="copyOutput">复制 JSON</button>
            <button class="btn btn-sm" @click="publishArticle">发布文章</button>
          </div>
        </div>
        <textarea class="text-output" readonly :value="mdToJsonResult" placeholder="转换结果将自动显示在这里..."></textarea>
      </div>

      <!-- 预览区 (JSON转文章渲染) -->
      <div class="editor-pane preview-pane" v-if="mode === 'json2md'">
        <div class="pane-header">
          <span>文章预览</span>
        </div>
        <div class="preview-content">
          <div v-if="!articleData" class="placeholder">粘贴 JSON 数据后在此预览</div>
          <div v-else-if="articleData.error" class="error">{{ articleData.error }}</div>
          <div v-else class="article-render">
            <h1 class="article-title">{{ articleData.title }}</h1>
            <p v-if="articleData.summary" class="article-summary typora-style" style="margin-top: 0;" v-html="articleData.summaryHtml"></p>
            <div class="article-meta">
              <span v-if="articleData.date">🕒 {{ articleData.date }}</span>
              <span>👁️ 阅读 {{ articleData.viewCount }}</span>
              <span>👍 点赞 {{ articleData.likeCount }}</span>
            </div>
            <div class="typora-style" v-html="articleData.htmlContent"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 独立提示弹窗 -->
    <div class="modal-overlay" v-if="customAlert.show">
      <div class="modal-content">
        <h3>提示</h3>
        <p>{{ customAlert.message }}</p>
        <div class="modal-actions">
          <button class="btn" @click="handleAlertConfirm">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container { max-width: 1400px; margin: 0 auto; padding: 40px 20px; height: 100vh; display: flex; flex-direction: column; }
.header { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.header-left { display: flex; align-items: center; gap: 20px; }
.back-btn { background: transparent; border: none; font-size: 14px; color: #666; cursor: pointer; transition: color 0.2s; }
.back-btn:hover { color: #111; }
.header h1 { font-size: 20px; font-weight: 500; color: #111; margin: 0; letter-spacing: -0.5px; }

.tabs { display: flex; gap: 8px; }
.tab { background: transparent; border: none; padding: 6px 12px; font-size: 13px; color: #666; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
.tab:hover { background: #f0f0f0; color: #111; }
.tab.active { background: #111; color: #fff; }

.editor-container { display: flex; gap: 20px; flex: 1; min-height: 0; }
.editor-pane { flex: 1; display: flex; flex-direction: column; background: #fafafa; border: 1px solid #eaeaea; border-radius: 6px; overflow: hidden; }
.pane-header { padding: 12px 16px; background: #fff; border-bottom: 1px solid #eaeaea; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #666; }
.text-input, .text-output { flex: 1; width: 100%; border: none; padding: 16px; font-family: monospace; font-size: 13px; line-height: 1.6; color: #333; resize: none; background: transparent; outline: none; box-sizing: border-box; }
.text-output { background: #f9f9f9; }

.btn { padding: 6px 12px; background-color: #111; color: #fff; border: 1px solid #111; border-radius: 4px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
.btn:hover { background-color: #333; }
.btn-outline { background-color: transparent; color: #111; border-color: #ccc; }
.btn-outline:hover { background: #f5f5f5; border-color: #111; }

.preview-pane { background: #fff; }
.preview-content { flex: 1; overflow-y: auto; padding: 40px; }
.placeholder { color: #999; text-align: center; margin-top: 100px; font-size: 14px; }
.error { color: red; text-align: center; margin-top: 100px; font-size: 14px; }

/* Typora 主题文章样式 */
.article-render { max-width: 800px; margin: 0 auto; }
.article-title { font-size: 32px; font-weight: 600; color: #111; margin: 0 0 20px 0; line-height: 1.4; }
.article-meta { display: flex; gap: 20px; font-size: 14px; color: #888; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #eee; }

/* Typora HTML 渲染细节样式 */
.typora-style { font-size: 16px; line-height: 1.8; color: #333; }
.typora-style :deep(h1), .typora-style :deep(h2), .typora-style :deep(h3), .typora-style :deep(h4) { color: #111; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.8em; }
.typora-style :deep(h1) { font-size: 24px; padding-bottom: 0.3em; border-bottom: 1px solid #eaeaea; }
.typora-style :deep(h2) { font-size: 20px; padding-bottom: 0.3em; border-bottom: 1px solid #eaeaea; }
.typora-style :deep(h3) { font-size: 18px; }
.typora-style :deep(p) { margin: 1em 0; }
.typora-style :deep(img) { max-width: 100%; display: block; margin: 20px auto; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.typora-style :deep(blockquote) { margin: 1.5em 0; padding: 10px 20px; border-left: 4px solid #ddd; background-color: #f9f9f9; color: #666; }
.typora-style :deep(code) { font-family: monospace; background-color: #f3f4f4; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; color: #c7254e; }
.typora-style :deep(pre) { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; line-height: 1.45; position: relative; }
.typora-style :deep(pre[data-lang]) { padding-top: 36px; }
.typora-style :deep(pre[data-lang])::before { content: attr(data-lang); position: absolute; top: 8px; right: 12px; font-size: 12px; color: #999; text-transform: uppercase; font-weight: 500; user-select: none; pointer-events: none; }
.typora-style :deep(pre code) { background-color: transparent; padding: 0; }
.typora-style :deep(ul), .typora-style :deep(ol) { padding-left: 2em; margin: 1em 0; }
.typora-style :deep(li) { margin: 0.2em 0; }
.typora-style :deep(a) { color: #0366d6; text-decoration: none; }
.typora-style :deep(a:hover) { text-decoration: underline; }

/* 弹窗样式 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.4); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(2px); }
.modal-content { background: #fff; padding: 32px; border-radius: 8px; width: 320px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); }
.modal-content h3 { margin: 0 0 12px 0; font-size: 18px; color: #111; font-weight: 600; }
.modal-content p { margin: 0 0 24px 0; font-size: 14px; color: #555; line-height: 1.5; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; }

@media (max-width: 768px) {
  .editor-container { flex-direction: column; }
  .preview-content { padding: 20px; }
}
</style>
