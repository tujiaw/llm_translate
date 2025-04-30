// translator.js - 翻译服务模块

import ApiService from './api.js';
import ConfigService from './config.js';
import Utils from './utils.js';

/**
 * 翻译服务类 - 整合API调用和翻译逻辑
 */
class TranslatorService {
  /**
   * 执行翻译操作
   * @param {string} text - 要翻译的文本
   * @returns {Promise<string>} 翻译结果
   */
  static async translate(text) {
    if (!text || text.trim() === '') {
      throw new Error('没有提供要翻译的文本');
    }
    
    // 加载配置
    const config = await ConfigService.load();
    
    // 检测语言
    const isChineseQuery = Utils.isChineseText(text);
    
    // 调用API服务执行翻译
    try {
      const translatedText = await ApiService.translate(text, {
        apiKey: config.apiKey,
        model: config.model,
        customModelName: config.customModelName,
        customModelEndpoint: config.customModelEndpoint,
        defaultApiEndpoint: config.defaultApiEndpoint
      });
      
      return translatedText;
    } catch (error) {
      console.error('翻译过程中出错:', error);
      throw error;
    }
  }

  /**
   * 获取可用的模型列表
   * @returns {Array<{id: string, name: string, category: string}>} 模型列表
   */
  static getAvailableModels() {
    return [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', category: 'openai' },
      { id: 'gpt-4', name: 'GPT-4', category: 'openai' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', category: 'anthropic' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', category: 'anthropic' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', category: 'anthropic' },
      { id: 'gemini-pro', name: 'Gemini Pro', category: 'google' },
      { id: 'THUDM/GLM-4-9B-0414', name: 'GLM-4-9B (免费)', category: 'free' },
      { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5-7B (免费)', category: 'free' },
      { id: 'Qwen/Qwen2.5-Coder-7B-Instruct', name: 'Qwen2.5-Coder-7B (免费)', category: 'free' },
      { id: 'THUDM/glm-4-9b-chat', name: 'GLM-4-9B-Chat (免费)', category: 'free' },
      { id: 'custom', name: '自定义模型', category: 'custom' }
    ];
  }

  /**
   * 获取模型的详细信息
   * @param {string} modelId - 模型ID
   * @returns {object|null} 模型信息或null
   */
  static getModelInfo(modelId) {
    return this.getAvailableModels().find(model => model.id === modelId) || null;
  }
}

// 导出翻译服务
export default TranslatorService; 