// api.js - 处理所有LLM API调用
import Utils from './utils.js';
import ConfigService from './config.js';

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
   * 将「仅域名」或 OpenAI SDK 常用的 base（/ 或 /v1）补全为 Chat Completions 路径，避免 404。
   * @param {string} rawUrl - 用户填写的 Base URL
   * @returns {string}
   */
  static normalizeChatEndpoint(rawUrl) {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) {
      return trimmed;
    }
    try {
      const url = new URL(trimmed);
      let path = url.pathname.replace(/\/+$/, '');
      if (path === '') {
        path = '/';
      }

      if (path === '/') {
        url.pathname = '/v1/chat/completions';
        return url.href.replace(/\/+$/, '');
      }

      if (path === '/v1') {
        url.pathname = '/v1/chat/completions';
        return url.href.replace(/\/+$/, '');
      }

      if (path === '/chat/completions') {
        url.pathname = '/v1/chat/completions';
        return url.href.replace(/\/+$/, '');
      }

      return trimmed.replace(/\/+$/, '');
    } catch {
      return trimmed;
    }
  }

  /**
   * @param {object} target - 目标对象
   * @param {object} source - 源对象
   * @returns {object}
   */
  static deepMerge(target, source) {
    const base = target && typeof target === 'object' ? { ...target } : {};
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return base;
    }
    const result = { ...base };
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const bv = result[key];
      if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
        result[key] = this.deepMerge(bv && typeof bv === 'object' ? bv : {}, sv);
      } else {
        result[key] = sv;
      }
    }
    return result;
  }

  /**
   * 解析并校验当前模型条目
   * @param {object} config - 配置信息
   * @returns {object} 模型条目
   */
  static resolveCurrentModelEntry(config) {
    const entry = ConfigService.getCurrentModel(config);
    if (!entry) {
      throw new Error('请先在扩展设置中添加并选择一个模型');
    }
    if (!(entry.baseUrl || '').trim()) {
      throw new Error('当前模型缺少 Base URL');
    }
    if (!(entry.model || '').trim()) {
      throw new Error('当前模型缺少 Model 名称');
    }
    if (!(entry.apiKey || '').trim()) {
      throw new Error('当前模型缺少 API Key');
    }
    return entry;
  }

  /**
   * 合并翻译请求体：OpenAI 兼容结构 + 用户自定义 JSON（messages 始终由扩展填充）
   * @param {object} entry - 模型条目
   * @param {string} systemPrompt - 系统提示
   * @param {string} userContent - 用户内容
   * @returns {object} requestBody
   */
  static mergeChatBody(entry, systemPrompt, userContent) {
    const modelName = entry.model.trim();
    const baseBody = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.3
    };

    const raw = (entry.bodyJson || '').trim();
    let extra = {};
    if (raw) {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`自定义 Body JSON 解析失败: ${e.message}`);
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('自定义 Body JSON 必须是 JSON 对象');
      }
      extra = parsed;
    }

    const merged = this.deepMerge(baseBody, extra);
    merged.model = modelName;
    merged.messages = baseBody.messages;
    return merged;
  }

  /**
   * 根据配置与文本内容创建API请求配置
   * @param {object} config - 配置信息
   * @param {string} text - 要翻译的文本
   * @param {boolean} isChineseQuery - 是否为中文查询
   * @returns {object} 包含 apiEndpoint 与 requestBody
   */
  static async createRequestConfig(config, text, isChineseQuery) {
    console.log('创建请求配置', JSON.stringify({
      currentModelId: config.currentModelId,
      modelsCount: Array.isArray(config.models) ? config.models.length : 0,
      nativeLanguage: config.nativeLanguage
    }));

    const nativeLanguage = config.nativeLanguage || 'zh';

    let sourceLang;
    let targetLang;
    let detectResult;

    try {
      detectResult = Utils.detectLanguage(text);
      console.log(`语言检测结果: 检测语言=${detectResult}, 用户母语=${nativeLanguage}`);

      if (detectResult === 'unknown') {
        if (isChineseQuery) {
          sourceLang = 'Chinese';
          targetLang = (nativeLanguage === 'zh') ? 'English' : Utils.getLanguageNameInEnglish(nativeLanguage);
        } else {
          sourceLang = 'English';
          targetLang = Utils.getLanguageNameInEnglish(nativeLanguage);
        }
      } else if (detectResult === nativeLanguage) {
        sourceLang = Utils.getLanguageNameInEnglish(nativeLanguage);
        targetLang = 'English';
      } else {
        sourceLang = Utils.getLanguageNameInEnglish(detectResult);
        targetLang = Utils.getLanguageNameInEnglish(nativeLanguage);
      }
    } catch (error) {
      console.error('语言检测错误:', error);
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

    const entry = this.resolveCurrentModelEntry(config);
    const apiEndpoint = this.normalizeChatEndpoint(entry.baseUrl);
    const requestBody = this.mergeChatBody(entry, systemPrompt, text);

    console.log(`准备请求: 端点=${apiEndpoint}, 模型=${entry.model.trim()}`);

    return { apiEndpoint, requestBody };
  }

  /**
   * 解析API响应，提取翻译结果（优先 OpenAI Chat 格式，兼容若干常见变体）
   * @param {object} data - API响应数据
   * @returns {string} 解析后的翻译文本
   */
  static parseApiResponse(data) {
    try {
      const choiceContent = data?.choices?.[0]?.message?.content;
      if (choiceContent != null && typeof choiceContent === 'string') {
        return choiceContent;
      }

      const claudeText = data?.content?.[0]?.text;
      if (claudeText != null && typeof claudeText === 'string') {
        return claudeText;
      }

      const geminiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (geminiText != null && typeof geminiText === 'string') {
        return geminiText;
      }

      if (data?.response != null) {
        return typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
      }

      return JSON.stringify(data);
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

    const isChineseQuery = /[\u4e00-\u9fa5]/.test(text);

    const { apiEndpoint, requestBody } = await this.createRequestConfig(
      config,
      text,
      isChineseQuery
    );

    if (!this.validateApiEndpoint(apiEndpoint)) {
      throw new Error(`无效的API端点: "${apiEndpoint}"`);
    }

    const entry = this.resolveCurrentModelEntry(config);
    const apiKey = entry.apiKey.trim();

    console.log(`API 密钥已配置: ${Boolean(apiKey)}`);

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
        let detail = `API请求失败: ${response.status} - ${errorText}`;
        if (response.status === 404) {
          detail += ' 常见原因：Base URL 未包含聊天路径，完整示例：https://api.deepseek.com/v1/chat/completions';
        }
        throw new Error(detail);
      }

      const data = await response.json();
      return this.parseApiResponse(data);
    } catch (error) {
      console.error('API请求错误:', error);
      if (error.message.includes('Failed to fetch')) {
        throw new Error(`无法连接到API服务器，请检查网络连接或API端点是否正确`);
      }
      throw error;
    }
  }
}

export default ApiService;

if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ApiService = ApiService;
}
