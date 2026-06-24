<template>
  <div class="ai-assistant-container">
    <div class="ai-header">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
        <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
      </svg>
      <h3>AI 文章助手</h3>
    </div>

    <!-- AI 回复展示区 -->
    <div class="ai-reply-area" v-show="aiReply || isThinking || error">
      <div v-if="aiReply" class="reply-content typora-style" v-html="formattedReply"></div>
      
      <!-- 光标动画 -->
      <span v-if="isThinking" class="cursor-blink"></span>
      
      <div v-if="error" class="error-msg">{{ error }}</div>
    </div>

    <!-- 交互输入区 -->
    <div class="ai-input-area">
      <input 
        v-model="questionInput" 
        @keyup.enter="handleSend"
        type="text" 
        class="ai-input"
        placeholder="向 AI 助手提问关于这篇文章的内容..."
        :disabled="isThinking"
      />
      <button 
        class="ai-send-btn"
        :class="{ 'is-loading': isThinking }"
        :disabled="isThinking || !questionInput.trim()"
        @click="handleSend"
      >
        <span v-if="!isThinking">提问</span>
        <span v-else class="btn-spinner"></span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { marked, processHtml } from '../utils/mdParser.js'
import { getToken, getTokenType } from '../utils/auth.js'

const props = defineProps({
  blogId: {
    type: [String, Number],
    required: true
  }
})

const questionInput = ref('')
const aiReply = ref('')
const isThinking = ref(false)
const error = ref('')

// 若 AI 返回的是 markdown，用 computed 转换为 HTML
const formattedReply = computed(() => {
  if (!aiReply.value) return ''
  
  // 修复 AI 可能返回没有空格的标题（例如 "###1.标题"），强制加上空格以支持 marked 解析
  const fixedMd = aiReply.value.replace(/^(#{1,6})(?=[^\s#])/gm, '$1 ')

  let htmlRaw = marked.parse(fixedMd)
  if (typeof htmlRaw !== 'string') {
    htmlRaw = String(htmlRaw)
  }
  return processHtml(htmlRaw)
})

const handleSend = async () => {
  if (!questionInput.value.trim() || isThinking.value) return
  
  const question = questionInput.value
  questionInput.value = ''
  aiReply.value = ''
  error.value = ''
  isThinking.value = true

  const token = getToken()
  const tokenType = getTokenType() || 'Bearer'
  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

  try {
    const response = await fetch(`${apiUrl}/ai/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `${tokenType} ${token}` : ''
      },
      body: JSON.stringify({
        blogId: String(props.blogId),
        question
      })
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('请先登录后再使用 AI 助手')
      }
      throw new Error(`请求失败 (${response.status})`)
    }

    if (!response.body) {
      throw new Error('当前浏览器不支持流式读取')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      
      // 按照 SSE 规范，每一条事件由 \n\n 结尾
      const parts = buffer.split('\n\n')
      // 最后一个元素可能是尚未接收完的一段内容，将它留在 buffer 中下次处理
      buffer = parts.pop() || ''

      for (const part of parts) {
        const lines = part.split('\n')
        const dataLines = []
        
        for (const line of lines) {
          if (line.startsWith('data:')) {
            let text = line.slice(5)
            // 规范：紧跟在 data: 后面的一个空格应该被忽略
            if (text.startsWith(' ')) {
              text = text.slice(1)
            }
            dataLines.push(text)
          }
        }
        
        if (dataLines.length > 0) {
          // SSE 如果多行 data，代表 payload 里有真实的换行符，所以这里 join('\n')
          aiReply.value += dataLines.join('\n')
        }
      }
    }
    
    // 如果最后还有没带着 \n\n 闭合的残留数据也清空
    if (buffer.length > 0) {
      const lines = buffer.split('\n')
      const dataLines = []
      for (const line of lines) {
        if (line.startsWith('data:')) {
          let text = line.slice(5)
          if (text.startsWith(' ')) text = text.slice(1)
          dataLines.push(text)
        }
      }
      if (dataLines.length > 0) {
        aiReply.value += dataLines.join('\n')
      }
    }
  } catch (e) {
    console.error('AI Stream Error:', e)
    error.value = e.message || '网络连接中断或服务异常，请稍后重试'
  } finally {
    isThinking.value = false
  }
}
</script>

<style scoped>
.ai-assistant-container {
  margin: 48px 0;
  background: linear-gradient(145deg, #ffffff, #fdfdfd);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.03);
  font-family: inherit;
}

.ai-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  color: #111;
}

.ai-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ai-reply-area {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  min-height: 80px;
  position: relative;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

.reply-content {
  font-size: 15px;
  line-height: 1.7;
  color: #333;
}

.cursor-blink {
  display: inline-block;
  width: 8px;
  height: 18px;
  background-color: #111;
  vertical-align: middle;
  animation: blink 1s step-end infinite;
  margin-left: 4px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.error-msg {
  color: #d32f2f;
  font-size: 14px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(211, 47, 47, 0.2);
}

.ai-input-area {
  display: flex;
  gap: 12px;
}

.ai-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
  background: #fafafa;
}

.ai-input:focus {
  border-color: #111;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.05);
}

.ai-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.ai-send-btn {
  padding: 0 24px;
  background-color: #111;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
}

.ai-send-btn:hover:not(:disabled) {
  background-color: #333;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.ai-send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
