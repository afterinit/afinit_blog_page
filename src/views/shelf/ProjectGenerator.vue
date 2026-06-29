<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import request, { AuthError } from '../../utils/request.js'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'

const router = useRouter()

const isGenerating = ref(false)

// ============== Code Generator Logic ==============
const sqlTypes = [
  'VARCHAR', 'CHAR', 'TEXT', 'INT', 'BIGINT', 'DECIMAL', 'DOUBLE', 'DATETIME', 'DATE', 'TIME', 'BOOLEAN'
]

const generatorData = reactive({
  projectName: '',
  databaseName: '',
  basePackage: '',
  generateCrud: true,
  tables: [
    {
      tableName: '',
      comment: '',
      columns: [
        {
          columnName: '',
          sqlType: 'VARCHAR',
          primary: false,
          notNull: false,
          comment: ''
        }
      ]
    }
  ]
})

const addTable = () => {
  generatorData.tables.push({
    tableName: '',
    comment: '',
    columns: [
      {
        columnName: '',
        sqlType: 'VARCHAR',
        primary: false,
        notNull: false,
        comment: ''
      }
    ]
  })
}

const removeTable = (index) => {
  generatorData.tables.splice(index, 1)
}

const addColumn = (tableIndex) => {
  generatorData.tables[tableIndex].columns.push({
    columnName: '',
    sqlType: 'VARCHAR',
    primary: false,
    notNull: false,
    comment: ''
  })
}

const removeColumn = (tableIndex, colIndex) => {
  generatorData.tables[tableIndex].columns.splice(colIndex, 1)
}

const isValidProjectName = (name) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)
const isValidPackageName = (name) => /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(name)
const isValidIdentifier = (name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
const reservedWords = new Set([
  'string', 'int', 'integer', 'long', 'boolean', 'char', 'float', 'double',
  'class', 'interface', 'public', 'private', 'protected', 'static', 'void',
  'return', 'new', 'this', 'super', 'if', 'else', 'switch', 'case', 'for',
  'while', 'do', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws',
  'select', 'insert', 'update', 'delete', 'from', 'where', 'table', 'index', 'view'
])
const isReserved = (name) => reservedWords.has(name.toLowerCase())

const formRef = ref(null)

const validateProjectName = (rule, value, callback) => {
  if (!value || !value.trim()) return callback(new Error('项目名称不能为空'))
  if (!isValidProjectName(value.trim())) return callback(new Error('不能以数字开头，只能包含字母、数字、下划线和中划线'))
  callback()
}

const validateBasePackage = (rule, value, callback) => {
  if (!value || !value.trim()) return callback(new Error('基础包名不能为空'))
  if (!isValidPackageName(value.trim())) return callback(new Error('段首不能为数字，只能包含字母、数字、下划线和点号'))
  callback()
}

const validateTableName = (rule, value, callback) => {
  if (!value || !value.trim()) return callback(new Error('表名不能为空'))
  if (!isValidIdentifier(value.trim())) return callback(new Error('必须以字母或下划线开头，不能包含特殊字符或中划线'))
  if (isReserved(value.trim())) return callback(new Error('是保留关键字，禁止使用'))
  callback()
}

const validateColumnName = (rule, value, callback) => {
  if (!value || !value.trim()) return callback(new Error('字段名称不能为空'))
  if (!isValidIdentifier(value.trim())) return callback(new Error('必须以字母或下划线开头，不能包含特殊字符或中划线'))
  if (isReserved(value.trim())) return callback(new Error('是保留关键字，禁止使用'))
  callback()
}

const validateDatabaseName = (rule, value, callback) => {
  if (value && value.trim() && !isValidIdentifier(value.trim())) {
    return callback(new Error('如果不为空，必须以字母或下划线开头，且不包含特殊字符'))
  }
  callback()
}

const formRules = {
  projectName: [{ required: true, validator: validateProjectName, trigger: 'blur' }],
  databaseName: [{ required: false, validator: validateDatabaseName, trigger: 'blur' }],
  basePackage: [{ required: true, validator: validateBasePackage, trigger: 'blur' }]
}

const tableRules = {
  tableName: [{ required: true, validator: validateTableName, trigger: 'blur' }],
  columnName: [{ required: true, validator: validateColumnName, trigger: 'blur' }]
}

const generateCustomProject = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) {
      ElMessage.warning('请检查并完善表单内标红的错误项')
      return
    }

    if (generatorData.tables.length === 0) {
      ElMessage.warning('至少需要一个数据表')
      return
    }
    
    for (let i = 0; i < generatorData.tables.length; i++) {
      if (generatorData.tables[i].columns.length === 0) {
        ElMessage.warning(`表 ${generatorData.tables[i].tableName} 至少需要一个字段`)
        return
      }
    }

    isGenerating.value = true
    try {
    const apiUrl = `${import.meta.env.VITE_API_BASE_URL || ''}/generate`
    
    const response = await request(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(generatorData),
      responseType: 'blob'
    })

    // request() wrapper returns { ok, status, headers: { get() }, blob() }
    const blobData = await response.blob()

    // Extract filename from header
    let filename = 'project.zip'
    const disposition = response.headers.get('content-disposition')
    if (disposition) {
      const utf8FilenameRegex = /filename\*=UTF-8''([^;\n]*)/;
      const matchesUtf8 = utf8FilenameRegex.exec(disposition);
      if (matchesUtf8 != null && matchesUtf8[1]) {
        filename = decodeURIComponent(matchesUtf8[1]);
      } else {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
        const matches = filenameRegex.exec(disposition)
        if (matches != null && matches[1]) { 
          filename = matches[1].replace(/['"]/g, '')
        }
      }
    }

    const url = window.URL.createObjectURL(new Blob([blobData]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', decodeURIComponent(filename))
    document.body.appendChild(link)
    link.click()
    link.parentNode.removeChild(link)
    
    ElMessage.success('项目构建成功并开始下载')
  } catch (error) {
    if (error.isAuthError) return
    ElMessage.error('生成失败：' + (error.message || '未知错误'))
    console.error(error)
  } finally {
    isGenerating.value = false
  }
  })
}
</script>

<template>
  <div class="generator-container">
    <div class="generator-box">
      <div class="header">
        <button class="back-btn" @click="router.push('/')">← 返回</button>
        <h2>项目构建器</h2>
      </div>

      <p class="subtitle">配置项目信息与数据表，一键构建代码骨架</p>

      <div class="custom-generator-section">
        <el-form ref="formRef" :model="generatorData" :rules="formRules" label-width="100px" label-position="left">
          <!-- 一、项目信息 -->
          <div class="section-card">
            <h3>一、项目信息</h3>
            <el-row :gutter="20">
              <el-col :span="8">
                <el-form-item label="项目名称" prop="projectName">
                  <el-input v-model="generatorData.projectName" placeholder="示例: demo" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="连接的数据库" prop="databaseName">
                  <el-input v-model="generatorData.databaseName" placeholder="选填: 默认同名" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="基础包名" prop="basePackage">
                  <el-input v-model="generatorData.basePackage" placeholder="示例: com.example.demo" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row>
              <el-col :span="24">
                <el-form-item label="业务代码" style="margin-bottom: 0;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <el-switch
                      v-model="generatorData.generateCrud"
                      active-text="开启 CRUD 生成"
                      inactive-text="关闭"
                    />
                    <span style="color: #64748b; font-size: 13px;">开启后，系统将自动生成 Controller、Service 和 Mapper 层基础增删改查代码</span>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </div>

          <!-- 二、数据表管理 & 三、字段管理 -->
          <div class="section-card">
            <div class="section-header">
              <h3>二、数据表管理 & 三、字段管理</h3>
              <el-button type="primary" :icon="Plus" @click="addTable">添加数据表</el-button>
            </div>
            
            <div v-if="generatorData.tables.length === 0" class="empty-text">
              暂无数据表，请点击右上角添加。
            </div>

            <el-card v-for="(table, tIndex) in generatorData.tables" :key="tIndex" class="table-card" shadow="hover">
              <template #header>
                <div class="table-card-header">
                  <div class="table-info-inputs">
                    <el-form-item :prop="`tables.${tIndex}.tableName`" :rules="tableRules.tableName" class="flex-1 custom-table-form-item">
                      <el-input v-model="table.tableName" placeholder="表名 (tableName)" class="mr-2">
                        <template #prepend>表名</template>
                      </el-input>
                    </el-form-item>
                    <el-form-item :prop="`tables.${tIndex}.comment`" class="flex-1 custom-table-form-item">
                      <el-input v-model="table.comment" placeholder="表注释 (comment)">
                        <template #prepend>注释</template>
                      </el-input>
                    </el-form-item>
                  </div>
                  <el-button type="danger" :icon="Delete" circle @click="removeTable(tIndex)" title="删除该表" />
                </div>
              </template>

              <!-- Columns Table -->
              <el-table :data="table.columns" border style="width: 100%">
                <el-table-column label="字段名称 (columnName)" min-width="220">
                  <template #default="scope">
                    <el-form-item :prop="`tables.${tIndex}.columns.${scope.$index}.columnName`" :rules="tableRules.columnName" class="custom-table-form-item mb-0">
                      <el-input v-model="scope.row.columnName" placeholder="字段名" />
                    </el-form-item>
                  </template>
                </el-table-column>
                
                <el-table-column label="类型 (sqlType)" width="150">
                  <template #default="scope">
                    <el-select v-model="scope.row.sqlType" placeholder="请选择">
                      <el-option v-for="type in sqlTypes" :key="type" :label="type" :value="type" />
                    </el-select>
                  </template>
                </el-table-column>

                <el-table-column label="主键 (primary)" width="90" align="center">
                  <template #default="scope">
                    <el-checkbox v-model="scope.row.primary" />
                  </template>
                </el-table-column>

                <el-table-column label="非空 (notNull)" width="90" align="center">
                  <template #default="scope">
                    <el-checkbox v-model="scope.row.notNull" />
                  </template>
                </el-table-column>

                <el-table-column label="注释 (comment)" min-width="150">
                  <template #default="scope">
                    <el-input v-model="scope.row.comment" placeholder="字段注释" />
                  </template>
                </el-table-column>

                <el-table-column label="操作" width="80" align="center">
                  <template #default="scope">
                    <el-button type="danger" :icon="Delete" circle size="small" @click="removeColumn(tIndex, scope.$index)" />
                  </template>
                </el-table-column>
              </el-table>

              <div class="add-col-btn">
                <el-button type="primary" plain :icon="Plus" size="small" @click="addColumn(tIndex)">添加字段</el-button>
              </div>
            </el-card>

          </div>
        </el-form>
      </div>

      <button 
        class="generate-btn" 
        :class="{ 'is-loading': isGenerating }"
        :disabled="isGenerating"
        @click="generateCustomProject"
      >
        <span v-if="isGenerating" class="spinner"></span>
        <span v-else>生成项目</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

.generator-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
  background-color: #fdfdfd;
  padding: 40px 20px 100px;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #333;
}

.generator-box {
  background: #fff;
  padding: 40px;
  border-radius: 12px;
  border: 1px solid #eaeaea;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 1000px;
  transition: all 0.3s ease;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

.back-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  color: #666;
  font-weight: 500;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: #f0f0f0;
  color: #111;
}

h2 {
  margin: 0;
  color: #111;
  font-weight: 700;
  font-size: 24px;
  text-align: center;
  flex: 1;
}

.subtitle {
  text-align: center;
  color: #666;
  margin-top: 24px;
  margin-bottom: 32px;
  font-size: 15px;
}

.custom-generator-section {
  margin-bottom: 24px;
}

.section-card {
  background: #fafafa;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #eaeaea;
}

.section-card h3 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 16px;
  color: #111;
  border-left: 4px solid #111;
  padding-left: 12px;
  font-weight: 600;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h3 {
  margin-bottom: 0;
  border-left: 4px solid #111;
  padding-left: 12px;
  font-size: 16px;
  color: #111;
  font-weight: 600;
}

.table-card {
  margin-bottom: 16px;
  border-radius: 8px;
  border-color: #eaeaea;
  box-shadow: 0 4px 12px rgba(0,0,0,0.02) !important;
}

.table-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-info-inputs {
  display: flex;
  gap: 16px;
  flex: 1;
  margin-right: 20px;
}

.flex-1 {
  flex: 1;
}

.custom-table-form-item {
  margin-bottom: 0;
}

.custom-table-form-item.is-error {
  margin-bottom: 22px;
}

.mr-2 {
  margin-right: 8px;
}

.add-col-btn {
  margin-top: 16px;
  text-align: center;
}

.empty-text {
  text-align: center;
  color: #888;
  padding: 30px 0;
  font-size: 14px;
}

.generate-btn {
  width: 100%;
  padding: 16px;
  background-color: #111;
  color: white;
  border: 1px solid #111;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 56px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  background-color: #333;
  box-shadow: 0 8px 20px rgba(0,0,0,0.15);
}

.generate-btn:disabled {
  background: #ddd;
  border-color: #ddd;
  color: #999;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .generator-box {
    padding: 24px;
    border: none;
    box-shadow: none;
  }
  .table-info-inputs {
    flex-direction: column;
    gap: 12px;
  }
}

/* 覆盖 Element Plus 默认蓝色主题 */
:deep(.el-button--primary) {
  background-color: #111 !important;
  border-color: #111 !important;
  color: #fff !important;
}
:deep(.el-button--primary:hover) {
  background-color: #333 !important;
  border-color: #333 !important;
}
:deep(.el-button--primary.is-plain) {
  background-color: transparent !important;
  border-color: #111 !important;
  color: #111 !important;
}
:deep(.el-button--primary.is-plain:hover) {
  background-color: #f5f5f5 !important;
  color: #111 !important;
}
:deep(.el-button--danger) {
  background-color: transparent !important;
  border-color: #ffcdd2 !important;
  color: #d32f2f !important;
}
:deep(.el-button--danger:hover) {
  background-color: #ffebee !important;
  border-color: #d32f2f !important;
}
:deep(.el-switch__core) {
  border-color: #ccc;
  background-color: #ccc;
}
:deep(.el-switch.is-checked .el-switch__core) {
  border-color: #111;
  background-color: #111;
}
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #111 inset !important;
}
:deep(.el-select .el-input.is-focus .el-input__wrapper) {
  box-shadow: 0 0 0 1px #111 inset !important;
}
:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #111;
  border-color: #111;
}
:deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #111;
}
</style>

