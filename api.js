// api.js - 处理所有LLM API调用
import Utils from './utils.js';

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
   * @param {string} text - 要翻译的文本
   * @param {boolean} isChineseQuery - 是否为中文查询
   * @returns {object} 包含apiEndpoint和requestBody的配置对象
   */
  static async createRequestConfig(config, text, isChineseQuery) {
    console.log('创建请求配置，输入配置:', JSON.stringify({
      currentModel: config.currentModel,
      hasApiKeys: Boolean(config.apiKeys),
      hasCustomModel: Boolean(config.customModel),
      modelDefinitions: Boolean(config.modelDefinitions),
      nativeLanguage: config.nativeLanguage
    }));
    
    // 获取用户母语，默认为中文
    const nativeLanguage = config.nativeLanguage || 'zh';
    
    // 获取源语言和目标语言
    let sourceLang, targetLang, detectResult;
    
    // 使用Utils进行语言检测
    try {
      // 直接使用静态导入的Utils
      
      // 获取语言检测结果
      detectResult = Utils.detectLanguage(text);
      console.log(`语言检测结果: 检测语言=${detectResult}, 用户母语=${nativeLanguage}`);
      
      // 改进的翻译逻辑：在检测到的语言和母语之间智能翻译
      if (detectResult === 'unknown') {
        // 如果检测到未知语言，则使用简单的中英文检测
        if (isChineseQuery) {
          sourceLang = 'Chinese';
          // 如果用户母语是中文，则翻译为英语；否则翻译为用户母语
          targetLang = (nativeLanguage === 'zh') ? 'English' : Utils.getLanguageNameInEnglish(nativeLanguage);
        } else {
          sourceLang = 'English';
          // 默认翻译为用户母语
          targetLang = Utils.getLanguageNameInEnglish(nativeLanguage);
        }
      } else if (detectResult === nativeLanguage) {
        // 如果检测到的语言与母语相同，默认翻译为英语
        sourceLang = Utils.getLanguageNameInEnglish(nativeLanguage);
        targetLang = 'English';
      } else {
        // 检测到的语言不是母语，翻译为母语
        sourceLang = Utils.getLanguageNameInEnglish(detectResult);
        targetLang = Utils.getLanguageNameInEnglish(nativeLanguage);
      }
    } catch (error) {
      console.error('语言检测错误:', error);
      // 回退到简单检测方式
      if (isChineseQuery) {
        sourceLang = 'Chinese';
        targetLang = (nativeLanguage === 'zh') ? 'English' : 'Chinese';
      } else {
        sourceLang = 'English';
        targetLang = (nativeLanguage === 'en') ? 'Chinese' : Utils.getLanguageNameInEnglish(nativeLanguage);
      }
    }
    
    console.log(`语言检测结果: 源语言=${sourceLang}, 目标语言=${targetLang}`);
    
    const systemPrompt = `You are a translation assistant. Please translate the following ${sourceLang} text into ${targetLang}, maintaining the original meaning, format, and tone. Output only the translation result without any explanation or additional content.`;
    // 获取当前选择的模型信息
    let modelInfo;
    
    try {
      if (config.currentModel === 'custom' && config.customModel && config.customModel.enabled) {
        modelInfo = config.customModel;
        console.log('使用自定义模型:', modelInfo.name);
      } else if (config.modelDefinitions && config.modelDefinitions[config.currentModel]) {
        modelInfo = config.modelDefinitions[config.currentModel];
        console.log('使用预定义模型:', modelInfo.name);
      } else {
        throw new Error(`无法找到模型信息: ${config.currentModel || '未指定模型'}`);
      }
    } catch (error) {
      console.error('获取模型信息错误:', error);
      throw error;
    }
    
    if (!modelInfo) {
      throw new Error(`未找到模型信息: ${config.currentModel || '未指定模型'}`);
    }
    
    if (!modelInfo.apiEndpoint) {
      throw new Error(`模型 ${modelInfo.name || config.currentModel} 缺少API端点配置`);
    }
    
    if (!modelInfo.type) {
      throw new Error(`模型 ${modelInfo.name || config.currentModel} 缺少类型配置`);
    }
    
    const apiEndpoint = modelInfo.apiEndpoint;
    const modelType = modelInfo.type;
    const modelName = modelInfo.name;
    
    console.log(`准备请求: 类型=${modelType}, 端点=${apiEndpoint}, 模型=${modelName}`);
    
    let requestBody;
    
    // 根据模型类型创建请求体
    switch (modelType) {
      case 'silicon-flow':
      case 'zhipu':
      case 'gpt':
        requestBody = {
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ],
          temperature: 0.3
        };
        break;
                
      case 'claude':
        requestBody = {
          model: modelName,
          system: systemPrompt,
          messages: [
            { role: "user", content: text }
          ],
          max_tokens: 1000
        };
        break;
        
      case 'gemini':
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
        break;
        
      case 'custom':
        requestBody = {
          model: modelName || 'default',
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ]
        };
        break;
        
      default:
        throw new Error(`不支持的模型类型: ${modelType}`);
    }
    
    return { apiEndpoint, requestBody, modelType };
  }

  /**
   * 解析API响应，提取翻译结果
   * @param {object} data - API响应数据
   * @param {string} modelType - 模型类型
   * @returns {string} 解析后的翻译文本
   */
  static parseApiResponse(data, modelType) {
    try {
      switch (modelType) {
        case 'silicon-flow':
        case 'zhipu':
        case 'gpt':
          return data.choices[0].message.content;
          
        case 'claude':
          return data.content[0].text;
          
        case 'gemini':
          return data.candidates[0].content.parts[0].text;
          
        case 'custom':
          // 自定义模型，尝试通用解析方法
          return data.choices ? 
            data.choices[0].message.content : 
            (data.response || data.output || data.result || JSON.stringify(data));
            
        default:
          throw new Error(`不支持的模型类型: ${modelType}`);
      }
    } catch (error) {
      throw new Error(`解析响应数据时出错: ${error.message}`);
    }
  }

  /**
   * 执行翻译请求
   * @param {string} text - 要翻译的文本
   * @param {object} config - 配置信息
   * @returns {Promise<string>} 翻译结果
   */
  static async translate(text, config) {
    if (!text || text.trim() === '') {
      throw new Error('没有提供要翻译的文本');
    }
    
    // 检测语言
    const isChineseQuery = /[\u4e00-\u9fa5]/.test(text);
    
    // 创建请求配置
    const { apiEndpoint, requestBody, modelType } = await this.createRequestConfig(
      config,
      text,
      isChineseQuery
    );
    
    // 验证API端点
    if (!this.validateApiEndpoint(apiEndpoint)) {
      throw new Error(`无效的API端点: "${apiEndpoint}"`);
    }
    
    // 获取对应的API密钥
    let apiKey;
    
    try {
      if (modelType === 'custom' && config.customModel && config.customModel.apiKey) {
        apiKey = config.customModel.apiKey;
      } else if (config.apiKeys && config.apiKeys[modelType]) {
        apiKey = config.apiKeys[modelType];
      }
      
      // 调试信息
      console.log(`模型类型: ${modelType}, API密钥存在: ${Boolean(apiKey)}`);
      
      if (!apiKey) {
        throw new Error(`Please configure API key in extension settings first. (${modelType})`);
      }
    } catch (error) {
      console.error('获取API密钥错误:', error);
      throw new Error(`无法获取API密钥: ${error.message}`);
    }
    
    // 发送API请求
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        throw new Error(`API请求失败: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      return this.parseApiResponse(data, modelType);
    } catch (error) {
      console.error('API请求错误:', error);
      if (error.message.includes('Failed to fetch')) {
        throw new Error(`无法连接到API服务器，请检查网络连接或API端点是否正确`);
      }
      throw error;
    }
  }
}

// 同时支持 ES 模块导出和 Service Worker 导入
export default ApiService;

// 在 Service Worker 环境中将其附加到全局对象
if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ApiService = ApiService;
} 