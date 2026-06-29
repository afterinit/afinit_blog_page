<script setup>
import { ref, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { parseMdToJson, processHtml, marked } from '../utils/mdParser.js'
import { parseJsonSafe, extractDataIdFromJsonText } from '../utils/json.js'
import { assertApiSuccess, getApiSuccessMessage } from '../utils/apiResponse.js'
import { refreshHomePosts } from '../composables/useHomeRefresh.js'
import { useDialog } from '../composables/useDialog.js'
import request, { AuthError } from '../utils/request.js'

const router = useRouter()
const inputText = ref('')
const fileInput = ref(null)
const textareaRef = ref(null)
const {
  dialog: customAlert,
  showDialog: showAlert,
  confirmDialog: handleAlertConfirm,
} = useDialog()

const articleData = computed(() => {
  if (!inputText.value.trim()) return null
  try {
    const parsed = parseMdToJson(inputText.value)
    
    let htmlRaw = marked.parse(parsed.content || '');
    if (typeof htmlRaw !== 'string') {
        htmlRaw = String(htmlRaw);
    }
    const htmlSafe = processHtml(htmlRaw);

    // 生成当前时间用于预览显示
    const now = new Date()
    const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    return {
      title: parsed.title || '未命名标题',
      summary: parsed.summary || '',
      summaryHtml: parsed.summary ? processHtml(marked.parseInline(parsed.summary)).replace(/\n/g, '<br>') : '',
      date: dateStr,
      viewCount: 0,
      likeCount: 0,
      htmlContent: htmlSafe,
      rawContent: parsed.content
    }
  } catch (e) {
    return { error: '解析出错: ' + e.message }
  }
})

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

async function publishArticle() {
  if (!articleData.value || articleData.value.error) {
    showAlert('没有可发布的有效内容');
    return;
  }
  
  try {
    const apiUrl = import.meta.env.VITE_API_BASE_URL;
    const response = await request(`${apiUrl}/blog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: articleData.value.title,
        summary: articleData.value.summary,
        content: articleData.value.rawContent
      })
    });
    
    const resText = await response.text()
    const newId = extractDataIdFromJsonText(resText)
    const res = parseJsonSafe(resText)
    assertApiSuccess(response, res, [20011], '发布失败');

    refreshHomePosts()

    showAlert(getApiSuccessMessage(res, '发布成功！'), () => {
      if (newId) {
        router.push(`/blog/${newId}?type=private`);
      } else if (res.data) {
        router.push(`/blog/${res.data}?type=private`);
      } else {
        router.push('/');
      }
    });
    
  } catch (err) {
    if (err.isAuthError) return
    showAlert(err.message);
  }
}
const downloadMd = () => {
  if (!inputText.value.trim()) {
    showAlert('没有可下载的内容');
    return;
  }
  
  const blob = new Blob([inputText.value], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const filename = articleData.value?.title ? `${articleData.value.title}.md` : 'article.md';
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const handleKeydown = (e) => {
  const el = textareaRef.value
  if (!el) return

  // Handle Tab key
  if (e.key === 'Tab') {
    e.preventDefault()
    const start = el.selectionStart
    const end = el.selectionEnd
    
    // Simple 4-space indentation for better code block experience
    inputText.value = inputText.value.substring(0, start) + '    ' + inputText.value.substring(end)
    
    nextTick(() => {
      el.selectionStart = el.selectionEnd = start + 4
    })
    return
  }

  // Handle Auto-pairing
  const pairs = {
    '{': '}',
    '[': ']',
    '(': ')',
    '"': '"',
    "'": "'",
    '`': '`',
    '*': '*'
  }
  
  if (pairs[e.key]) {
    const start = el.selectionStart
    const end = el.selectionEnd

    // If typing the closing bracket/quote when it's already there, just move cursor
    if (start === end && inputText.value[start] === e.key && Object.values(pairs).includes(e.key)) {
      e.preventDefault()
      el.selectionStart = el.selectionEnd = start + 1
      return
    }

    e.preventDefault()
    // Insert pair
    inputText.value = inputText.value.substring(0, start) + e.key + pairs[e.key] + inputText.value.substring(end)
    
    // Move cursor between the pair
    nextTick(() => {
      el.selectionStart = el.selectionEnd = start + 1
    })
    return
  }
  
  // Handle Backspace inside an empty pair
  if (e.key === 'Backspace') {
    const start = el.selectionStart
    if (start === el.selectionEnd && start > 0) {
      const prevChar = inputText.value[start - 1]
      const nextChar = inputText.value[start]
      if (pairs[prevChar] && pairs[prevChar] === nextChar) {
        e.preventDefault()
        inputText.value = inputText.value.substring(0, start - 1) + inputText.value.substring(start + 1)
        nextTick(() => {
          el.selectionStart = el.selectionEnd = start - 1
        })
        return
      }
    }
  }

  // Handle Enter between braces (like IDEA)
  if (e.key === 'Enter') {
    const start = el.selectionStart
    if (start === el.selectionEnd && start > 0) {
      const prevChar = inputText.value[start - 1]
      const nextChar = inputText.value[start]
      if (prevChar === '{' && nextChar === '}') {
        e.preventDefault()
        const before = inputText.value.substring(0, start)
        const after = inputText.value.substring(start)
        
        // Match the indentation of the current line
        const lines = before.split('\n')
        const currentLine = lines[lines.length - 1]
        const indentMatch = currentLine.match(/^\s*/)
        const indent = indentMatch ? indentMatch[0] : ''
        
        inputText.value = before + '\n' + indent + '    \n' + indent + after
        nextTick(() => {
          el.selectionStart = el.selectionEnd = start + 1 + indent.length + 4
        })
        return
      }
    }
  }
}
</script>

<template>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <button class="back-btn" @click="router.push('/')">← 返回列表</button>
        <h1>Markdown 编辑器</h1>
      </div>
      <div class="header-actions">
        <button class="btn" @click="publishArticle">发布文章</button>
      </div>
    </div>

    <div class="editor-container">
      <!-- 输入区 -->
      <div class="editor-pane">
        <div class="pane-header">
          <span>编辑 (支持拖拽 Markdown 文件)</span>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-outline" @click="downloadMd">下载 MD</button>
            <button class="btn btn-sm btn-outline" @click="fileInput.click()">导入文件</button>
          </div>
          <input ref="fileInput" type="file" style="display: none" accept=".md,.txt" @change="handleFileSelect" />
        </div>
        <textarea 
          ref="textareaRef"
          class="text-input" 
          v-model="inputText" 
          placeholder="在此编写 Markdown...&#10;&#10;第一行请写 # 标题&#10;接着使用 > 编写文章摘要（可选）&#10;&#10;然后是文章正文内容。"
          @keydown="handleKeydown"
          @dragover.prevent
          @drop="handleDrop"
        ></textarea>
      </div>

      <!-- 预览区 -->
      <div class="editor-pane preview-pane">
        <div class="pane-header">
          <span>实时渲染</span>
        </div>
        <div class="preview-content">
          <div v-if="!articleData" class="placeholder">在左侧编写 Markdown 后实时预览</div>
          <div v-else-if="articleData.error" class="error">{{ articleData.error }}</div>
          <div v-else class="article-render">
            <h1 class="article-title">{{ articleData.title }}</h1>
            <p v-if="articleData.summary" class="article-summary typora-style" style="margin-top: 0;" v-html="articleData.summaryHtml"></p>
            <div class="article-meta">
              <span>{{ articleData.date }}</span>
              <span>阅读 {{ articleData.viewCount }}</span>
              <span>点赞 {{ articleData.likeCount }}</span>
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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

.container { max-width: 1400px; margin: 0 auto; padding: 40px 20px; height: 100vh; display: flex; flex-direction: column; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #fdfdfd; }
.header { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.header-left { display: flex; align-items: center; gap: 20px; }
.header-actions { display: flex; gap: 12px; }
.back-btn { background: transparent; border: none; font-size: 14px; color: #666; cursor: pointer; transition: color 0.2s; }
.back-btn:hover { color: #111; }
.header h1 { font-size: 20px; font-weight: 500; color: #111; margin: 0; letter-spacing: -0.5px; }

.editor-container { display: flex; gap: 20px; flex: 1; min-height: 0; }
.editor-pane { flex: 1; display: flex; flex-direction: column; background: #fafafa; border: 1px solid #eaeaea; border-radius: 6px; overflow: hidden; }
.pane-header { padding: 12px 16px; background: #fff; border-bottom: 1px solid #eaeaea; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #666; }
.text-input { flex: 1; width: 100%; border: none; padding: 20px; font-family: 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.6; color: #333; resize: none; background: transparent; outline: none; box-sizing: border-box; }

.btn { padding: 6px 16px; background-color: #111; color: #fff; border: 1px solid #111; border-radius: 4px; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.btn:hover { background-color: #333; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-outline { background-color: transparent; color: #111; border-color: #ccc; }
.btn-outline:hover { background: #f5f5f5; border-color: #111; }

.preview-pane { background: #fff; }
.preview-content { flex: 1; overflow-y: auto; padding: 40px; }
.placeholder { color: #999; text-align: center; margin-top: 100px; font-size: 14px; }
.error { color: red; text-align: center; margin-top: 100px; font-size: 14px; }

/* Typora 主题文章样式 */
.article-render { animation: fade-in 0.6s ease-out; }
@keyframes fade-in { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }

.article-title { font-size: 40px; font-weight: 800; color: #111; margin: 0 0 24px 0; line-height: 1.3; letter-spacing: -0.03em; }

.article-summary { 
  font-size: 16px; 
  color: #444; 
  background: linear-gradient(135deg, #fdfbfb 0%, #f3f4f6 100%);
  padding: 20px 24px; 
  border-left: 4px solid #111; 
  margin: 0 0 24px 0; 
  border-radius: 0 8px 8px 0; 
  box-shadow: 0 4px 12px rgba(0,0,0,0.02);
  line-height: 1.6;
}

.article-meta { 
  display: flex; 
  align-items: center;
  flex-wrap: wrap;
  gap: 20px; 
  font-size: 14px; 
  color: #777; 
  margin-bottom: 48px; 
  padding-bottom: 24px; 
  border-bottom: 1px solid rgba(0,0,0,0.06); 
  font-weight: 500;
}
.article-meta span { display: flex; align-items: center; gap: 6px; }

/* Typora HTML 渲染细节样式 */
.typora-style { font-size: 17px; line-height: 1.85; color: #333; }
.typora-style :deep(h1), .typora-style :deep(h2), .typora-style :deep(h3), .typora-style :deep(h4) { color: #111; font-weight: 700; margin-top: 2em; margin-bottom: 1em; letter-spacing: -0.01em; }
.typora-style :deep(h1) { font-size: 28px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.06); }
.typora-style :deep(h2) { font-size: 24px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.06); }
.typora-style :deep(h3) { font-size: 20px; }
.typora-style :deep(p) { margin: 1.2em 0; }
.typora-style :deep(img) { 
  max-width: 100%; 
  display: block; 
  margin: 32px auto; 
  border-radius: 8px; 
  box-shadow: 0 8px 30px rgba(0,0,0,0.08); 
  cursor: zoom-in; 
  transition: transform 0.3s ease;
}
.typora-style :deep(video) { 
  width: 100%;
  max-width: 100%; 
  height: auto;
  display: block; 
  margin: 32px auto; 
  border-radius: 8px; 
  box-shadow: 0 8px 30px rgba(0,0,0,0.08); 
  outline: none;
}
.typora-style :deep(img:hover) { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.12); }
.typora-style :deep(blockquote) { 
  margin: 2em 0; 
  padding: 16px 24px; 
  border-left: 4px solid #ddd; 
  background-color: #fafafa; 
  color: #555; 
  font-style: italic;
  border-radius: 0 8px 8px 0;
}
.typora-style :deep(code) { 
  font-family: 'JetBrains Mono', monospace; 
  background-color: #f0f1f3; 
  padding: 3px 6px; 
  border-radius: 6px; 
  font-size: 0.85em; 
  color: #d13a69; 
}
.typora-style :deep(pre) { 
  background-color: #ffffff; 
  color: #333;
  padding: 20px; 
  border-radius: 12px; 
  overflow-x: auto; 
  line-height: 1.5; 
  position: relative; 
  box-shadow: 0 10px 30px rgba(0,0,0,0.05);
  border: 1px solid rgba(0,0,0,0.06);
  margin: 2em 0;
}
.typora-style :deep(pre::before) {
  content: '';
  display: block;
  position: absolute;
  top: 16px;
  left: 16px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff5f56;
  box-shadow: 20px 0 0 #ffbd2e, 40px 0 0 #27c93f;
}
.typora-style :deep(pre[data-lang]) { padding-top: 48px; }
.typora-style :deep(pre[data-lang])::after { 
  content: attr(data-lang); 
  position: absolute; 
  top: 12px; 
  right: 16px; 
  font-size: 12px; 
  color: #888; 
  text-transform: uppercase; 
  font-weight: 600; 
  letter-spacing: 0.5px;
  transition: opacity 0.2s;
  pointer-events: none;
}
.typora-style :deep(.copy-code-btn) {
  position: absolute;
  top: 10px;
  right: 16px;
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  padding: 4px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}
.typora-style :deep(pre:hover .copy-code-btn) { opacity: 1; }
.typora-style :deep(pre:hover::after) { opacity: 0; }
.typora-style :deep(.copy-code-btn:hover) { color: #111; }
.typora-style :deep(pre code) { background-color: transparent; padding: 0; color: inherit; font-size: 15px; }
.typora-style :deep(ul), .typora-style :deep(ol) { padding-left: 2em; margin: 1.2em 0; }
.typora-style :deep(li) { margin: 0.4em 0; }
.typora-style :deep(a) { 
  color: #0366d6; 
  text-decoration: none; 
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s, color 0.2s;
}
.typora-style :deep(a:hover) { 
  color: #005cc5;
  border-bottom-color: #005cc5;
}

/* 表格样式优化 */
.typora-style :deep(table) {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  margin: 2em 0;
  display: block;
  overflow-x: auto;
  white-space: nowrap;
}
.typora-style :deep(th), .typora-style :deep(td) {
  padding: 12px 16px;
  text-align: left;
}
.typora-style :deep(thead th) {
  border-top: 1px solid #111;
  border-bottom: 1px solid #111;
  font-weight: 600;
  color: #111;
}
.typora-style :deep(tbody tr:last-child td) {
  border-bottom: 1px solid #111;
}
.typora-style :deep(tbody tr:not(:last-child) td) {
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

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
