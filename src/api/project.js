import { fetchBlob } from './base.js'

export const projectApi = {
  /**
   * 生成项目并下载 zip
   * @param {object} generatorData
   * @returns {Promise<{ blob: Blob, filename: string }>}
   */
  async generate(generatorData) {
    const { blob, filename } = await fetchBlob('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(generatorData)
    })
    return {
      blob,
      filename: filename || 'project.zip'
    }
  }
}
