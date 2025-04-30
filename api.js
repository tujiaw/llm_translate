// api.js - 处理所有LLM API调用

/**
 * API服务类 - 处理所有与LLM模型API相关的逻辑
 */
class ApiService {
  /**
   * 验证API端点URL是否有效
   * @param {string} url - API端点URL
   * @returns {boolean} URL是否有效
   */
  static validateApiEndpoint(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      console.error('API端点无效:', url, e);
      return false;
    }
  }

  /**
   * 根据模型类型和文本内容创建API请求配置
   * @param {object} config - 配置信息
   * @param {string} config.model - 模型名称
   * @param {string} config.customModelName - 自定义模型名称
   * @param {string} config.customModelEndpoint - 自定义模型API端点
   * @param {string} config.defaultApiEndpoint - 默认API端点
   * @param {string} text - 要翻译的文本
   * @param {boolean} isChineseQuery - 是否为中文查询
   * @returns {object} 包含apiEndpoint和requestBody的配置对象
   */
  static createRequestConfig(config, text, isChineseQuery) {
    const systemPrompt = isChineseQuery 
      ? "你是一个翻译助手，请将以下中文文本翻译成英文，保持原文的意思、格式和语气。只输出翻译结果，不要有任何解释或额外内容。" 
      : "你是一个翻译助手，请将以下英文文本翻译成中文，保持原文的意思、格式和语气。只输出翻译结果，不要有任何解释或额外内容。";
    
    let apiEndpoint, requestBody;
    const model = config.model;
    
    // 根据模型配置API请求
    if (model === 'custom' && config.customModelEndpoint) {
      apiEndpoint = config.customModelEndpoint;
      requestBody = {
        model: config.customModelName || 'default',
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ]
      };
    } else if (model === 'gpt-3.5-turbo' || model === 'gpt-4') {
      apiEndpoint = 'https://api.openai.com/v1/chat/completions';
      requestBody = {
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        temperature: 0.3
      };
    } else if (model.startsWith('claude')) {
      apiEndpoint = 'https://api.anthropic.com/v1/messages';
      requestBody = {
        model: model,
        system: systemPrompt,
        messages: [
          { role: "user", content: text }
        ],
        max_tokens: 1000
      };
    } else if (model.startsWith('gemini')) {
      apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
      requestBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: systemPrompt + "\n\n" + text }]
          }
        ],
        generationConfig: {
          temperature: 0.2
        }
      };
    } else if (model.startsWith('THUDM/') || model.startsWith('Qwen/')) {
      if (!config.defaultApiEndpoint) {
        throw new Error('默认API端点未设置');
      }
      
      apiEndpoint = config.defaultApiEndpoint;
      requestBody = {
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        temperature: 0.3
      };
    } else {
      throw new Error(`不支持的模型类型: ${model}`);
    }
    
    return { apiEndpoint, requestBody };
  }

  /**
   * 解析API响应，提取翻译结果
   * @param {object} data - API响应数据
   * @param {string} model - 使用的模型名称
   * @returns {string} 解析后的翻译文本
   */
  static parseApiResponse(data, model) {
    try {
      if (model === 'gpt-3.5-turbo' || model === 'gpt-4') {
        return data.choices[0].message.content;
      } else if (model.startsWith('claude')) {
        return data.content[0].text;
      } else if (model.startsWith('gemini')) {
        return data.candidates[0].content.parts[0].text;
      } else if (model.startsWith('THUDM/') || model.startsWith('Qwen/')) {
        return data.choices[0].message.content;
      } else {
        // 自定义模型，尝试通用解析方法
        return data.choices ? 
          data.choices[0].message.content : 
          (data.response || data.output || data.result || JSON.stringify(data));
      }
    } catch (error) {
      throw new Error(`解析响应数据时出错: ${error.message}`);
    }
  }

  /**
   * 执行翻译请求
   * @param {string} text - 要翻译的文本
   * @param {object} options - 请求选项
   * @returns {Promise<string>} 翻译结果
   */
  static async translate(text, options) {
    if (!text || text.trim() === '') {
      throw new Error('没有提供要翻译的文本');
    }

    const { apiKey, model, customModelName, customModelEndpoint, defaultApiEndpoint } = options;
    
    if (!apiKey) {
      throw new Error('API密钥未设置');
    }
    
    // 检测语言
    const isChineseQuery = /[\u4e00-\u9fa5]/.test(text);
    
    // 创建请求配置
    const { apiEndpoint, requestBody } = this.createRequestConfig(
      { model, customModelName, customModelEndpoint, defaultApiEndpoint },
      text,
      isChineseQuery
    );
    
    // 验证API端点
    if (!this.validateApiEndpoint(apiEndpoint)) {
      throw new Error(`无效的API端点: "${apiEndpoint}"`);
    }
    
    // 发送API请求
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }
    
    const data = await response.json();
    return this.parseApiResponse(data, model);
  }
}

// 同时支持 ES 模块导出和 Service Worker 导入
export default ApiService;

// 在 Service Worker 环境中将其附加到全局对象
if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ApiService = ApiService;
} 