// api.js - 处理所有 LLM API 调用
import Utils from './utils.js';
import ConfigService from './config.js';

class ApiService {
  static TEST_TIMEOUT_MS = 15000;

  static validateApiEndpoint(url) {
    try {
      new URL(url);
      return true;
    } catch (error) {
      console.error('API端点无效:', url, error);
      return false;
    }
  }

  static normalizeApiKey(apiKey) {
    return (apiKey || '').trim().replace(/^Bearer\s+/i, '');
  }

  /**
   * 将 OpenAI SDK 常用的 base_url（域名、/v1、/openai/v1 等）补全为 Chat Completions 路径。
   */
  static normalizeChatEndpoint(rawUrl) {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) {
      return trimmed;
    }

    try {
      const url = new URL(trimmed);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path.endsWith('/chat/completions')) {
        url.pathname = path;
      } else if (path === '/') {
        url.pathname = '/v1/chat/completions';
      } else {
        url.pathname = `${path}/chat/completions`;
      }

      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/+$/, '');
    } catch {
      return trimmed.replace(/\/+$/, '');
    }
  }

  static buildHeaders(apiKey) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    };
  }

  static deepMerge(target, source) {
    const base = target && typeof target === 'object' ? { ...target } : {};
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return base;
    }

    const result = { ...base };
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const baseValue = result[key];
      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        result[key] = this.deepMerge(
          baseValue && typeof baseValue === 'object' ? baseValue : {},
          sourceValue
        );
      } else {
        result[key] = sourceValue;
      }
    }
    return result;
  }

  static parseBodyJson(rawJson) {
    const raw = (rawJson || '').trim();
    if (!raw) {
      return {};
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`自定义 Body JSON 解析失败: ${error.message}`);
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('自定义 Body JSON 必须是 JSON 对象');
    }
    return parsed;
  }

  static resolveCurrentModelEntry(config) {
    const entry = ConfigService.getModelEntryOrBing(config);
    this.assertModelEntry(entry);
    return entry;
  }

  static assertModelEntry(entry) {
    if (entry.serviceType === 'bing') {
      return;
    }
    if (!(entry.baseUrl || '').trim()) {
      throw new Error('请填写接口地址（Base URL）');
    }
    if (!(entry.model || '').trim()) {
      throw new Error('请填写模型 ID');
    }
    if (!this.normalizeApiKey(entry.apiKey)) {
      throw new Error('请填写 API Key');
    }
  }

  /**
   * 按服务商使用其支持的参数强制关闭思考模式。
   * 在自定义 Body 合并后调用，确保用户配置不能意外重新开启思考。
   * @param {object} entry - 当前模型配置
   * @param {object} requestBody - 已合并的请求体
   * @returns {object} 强制关闭思考后的请求体
   */
  static disableThinking(entry, requestBody) {
    const body = requestBody;
    const providerId = (entry.providerId || 'custom').trim();
    const modelName = (entry.model || '').trim().toLowerCase();

    // 先移除自定义 Body 中所有可能开启或输出思考内容的字段。
    delete body.enable_thinking;
    delete body.thinking;
    delete body.thinking_budget;
    delete body.thinking_level;
    delete body.thinkingConfig;
    delete body.reasoning;
    delete body.reasoning_effort;
    delete body.reasoning_format;
    delete body.include_reasoning;

    if (providerId === 'deepseek') {
      body.thinking = { type: 'disabled' };
    } else if (providerId === 'dashscope') {
      body.enable_thinking = false;
    } else if (providerId === 'zhipu') {
      body.thinking = { type: 'disabled' };
    } else if (providerId === 'gemini') {
      // Gemini 3 起改用 thinkingLevel，2.5 及更早用 thinkingBudget，两套参数不能混用
      if (/^gemini-3/.test(modelName)) {
        body.thinkingConfig = { thinkingLevel: 'minimal' };
      } else {
        body.thinkingConfig = { thinkingBudget: 0 };
      }
    } else if (providerId === 'openai' && /^gpt-5\.(?:[1-9]\d*)/.test(modelName)) {
      body.reasoning_effort = 'none';
    }

    return body;
  }

  static mergeChatBody(entry, systemPrompt, userContent) {
    const modelName = entry.model.trim();
    const baseBody = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.3,
      stream: false
    };

    const extra = this.parseBodyJson(entry.bodyJson);
    const merged = this.deepMerge(baseBody, extra);
    merged.model = modelName;
    merged.messages = baseBody.messages;
    merged.stream = false;
    return this.disableThinking(entry, merged);
  }

  static async createRequestConfig(config, text, isChineseQuery) {
    console.log('创建请求配置', JSON.stringify({
      currentModelId: config.currentModelId,
      modelsCount: Array.isArray(config.models) ? config.models.length : 0,
      nativeLanguage: config.nativeLanguage
    }));

    const nativeLanguage = config.nativeLanguage || 'zh';
    let sourceLang;
    let targetLang;

    try {
      const detectResult = Utils.detectLanguage(text);
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

    const systemPrompt = `You are a translation assistant. Please translate the following ${sourceLang} text into ${targetLang}, maintaining the original meaning, format, and tone. Output only the translation result without any explanation or additional content.`;
    const entry = this.resolveCurrentModelEntry(config);
    const apiEndpoint = this.normalizeChatEndpoint(entry.baseUrl);
    const requestBody = this.mergeChatBody(entry, systemPrompt, text);

    console.log(`准备请求: 端点=${apiEndpoint}, 模型=${entry.model.trim()}`);
    return { apiEndpoint, requestBody, entry };
  }

  static extractTextContent(value) {
    if (value == null) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((part) => this.extractTextContent(part)).join('');
    }
    if (typeof value === 'object') {
      if (typeof value.text === 'string') {
        return value.text;
      }
      if (typeof value.content === 'string') {
        return value.content;
      }
      if (Array.isArray(value.content)) {
        return this.extractTextContent(value.content);
      }
      return '';
    }
    return String(value);
  }

  static parseApiResponse(data) {
    try {
      const message = data?.choices?.[0]?.message;
      const choiceContent = this.extractTextContent(message?.content)
        || this.extractTextContent(data?.choices?.[0]?.text);
      if (choiceContent) {
        return choiceContent;
      }

      const claudeText = this.extractTextContent(data?.content?.[0]?.text);
      if (claudeText) {
        return claudeText;
      }

      const geminiText = this.extractTextContent(data?.candidates?.[0]?.content?.parts?.[0]?.text);
      if (geminiText) {
        return geminiText;
      }

      if (data?.response != null) {
        return typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
      }

      throw new Error('响应里没有可用的文本内容，请确认接口是 OpenAI Chat Completions 兼容格式');
    } catch (error) {
      throw new Error(`解析响应数据时出错: ${error.message}`);
    }
  }

  static statusHint(status) {
    switch (status) {
      case 401:
        return 'API Key 无效或未开通，请核对后重试。';
      case 403:
        return '当前 Key 无权调用该模型，请检查模型名或套餐权限。';
      case 404:
        return '接口地址不正确。可只填到 /v1，扩展会自动补全 /chat/completions。';
      case 429:
        return '请求过于频繁，或额度/余额不足。';
      case 500:
      case 502:
      case 503:
        return '服务端暂时出错，请稍后重试。';
      default:
        return '';
    }
  }

  static async readErrorDetail(response) {
    const errorText = await response.text().catch(() => '');
    let message = errorText;
    try {
      const json = JSON.parse(errorText);
      message = json?.error?.message || json?.message || json?.error?.code || errorText;
    } catch {
      // 保留原始文本
    }

    const hint = this.statusHint(response.status);
    return [`HTTP ${response.status}`, message, hint].filter(Boolean).join(' — ');
  }

  static describeNetworkError(error) {
    const raw = error?.message || String(error);
    if (!raw.includes('Failed to fetch') && error?.name !== 'TypeError') {
      return raw;
    }
    return '无法连接到接口，请检查网络和接口地址。';
  }

  static mergeAbortSignals(signals) {
    const active = signals.filter(Boolean);
    if (active.length === 0) {
      return undefined;
    }
    if (active.length === 1) {
      return active[0];
    }
    if (typeof AbortSignal.any === 'function') {
      return AbortSignal.any(active);
    }

    const controller = new AbortController();
    for (const signal of active) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener('abort', () => {
        controller.abort(signal.reason);
      }, { once: true });
    }
    return controller.signal;
  }

  static createTimeoutSignal(timeoutMs) {
    if (typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(timeoutMs);
    }
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new DOMException(`Timeout ${timeoutMs}ms`, 'TimeoutError'));
    }, timeoutMs);
    return controller.signal;
  }

  static isAbortError(error) {
    return error?.name === 'AbortError' || error?.name === 'TimeoutError';
  }

  static isTimeoutReason(error, signal) {
    const reason = signal?.reason || error;
    return error?.name === 'TimeoutError' || reason?.name === 'TimeoutError';
  }

  static async postChat(entry, requestBody, options = {}) {
    const apiEndpoint = this.normalizeChatEndpoint(entry.baseUrl);
    if (!this.validateApiEndpoint(apiEndpoint)) {
      throw new Error(`无效的接口地址: "${entry.baseUrl || ''}"`);
    }

    const apiKey = this.normalizeApiKey(entry.apiKey);
    try {
      const fetchOptions = {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify(requestBody)
      };
      if (options.signal) {
        fetchOptions.signal = options.signal;
      }

      const response = await fetch(apiEndpoint, fetchOptions);

      if (!response.ok) {
        throw new Error(await this.readErrorDetail(response));
      }

      return response.json();
    } catch (error) {
      if (this.isAbortError(error)) {
        throw error;
      }
      console.error('API请求错误:', error);
      if (error && typeof error.message === 'string' && error.message.startsWith('HTTP ')) {
        throw error;
      }
      throw new Error(this.describeNetworkError(error));
    }
  }

  static async testConnection(entry, options = {}) {
    this.assertModelEntry(entry);

    const timeoutMs = options.timeoutMs || ApiService.TEST_TIMEOUT_MS;
    const timeoutSec = Math.max(1, Math.round(timeoutMs / 1000));
    const mergedSignal = this.mergeAbortSignals([
      options.signal,
      this.createTimeoutSignal(timeoutMs)
    ]);

    const started = Date.now();
    try {
      let preview;
      let endpoint;
      if (entry.serviceType === 'bing') {
        preview = await this.translateViaBing('Hello', 'zh', mergedSignal);
        endpoint = 'edge.microsoft.com（免费接口）';
      } else {
        const extra = this.parseBodyJson(entry.bodyJson);
        const requestBody = this.deepMerge({
          model: entry.model.trim(),
          messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
          stream: false
        }, extra);

        requestBody.model = entry.model.trim();
        requestBody.messages = [
          { role: 'user', content: 'Reply with the single word: pong' }
        ];
        requestBody.stream = false;
        this.disableThinking(entry, requestBody);

        const data = await this.postChat(entry, requestBody, { signal: mergedSignal });
        preview = this.parseApiResponse(data).trim().slice(0, 80);
        endpoint = this.normalizeChatEndpoint(entry.baseUrl);
      }
      const latencyMs = Date.now() - started;
      return { ok: true, latencyMs, preview, endpoint };
    } catch (error) {
      if (options.signal?.aborted) {
        const cancelError = new Error('已取消测试');
        cancelError.code = 'TEST_CANCELLED';
        throw cancelError;
      }
      if (this.isAbortError(error) || this.isTimeoutReason(error, mergedSignal)) {
        const timeoutError = new Error(`连接超时（${timeoutSec}秒），请检查网络或接口是否可访问。`);
        timeoutError.code = 'TEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    }
  }

  static async translate(text, config) {
    if (!text || text.trim() === '') {
      throw new Error('没有提供要翻译的文本');
    }

    const { serviceType } = this.resolveCurrentModelEntry(config);
    if (serviceType === 'bing') {
      return this.translateViaBing(text, config.nativeLanguage || 'zh');
    }

    const isChineseQuery = /[\u4e00-\u9fa5]/.test(text);
    const { requestBody, entry } = await this.createRequestConfig(config, text, isChineseQuery);
    const data = await this.postChat(entry, requestBody);
    return this.parseApiResponse(data);
  }

  /**
   * 将 nativeLanguage 代码映射为微软翻译目标语言代码。
   * @param {string} code - 语言代码（如 zh、en、ja）
   * @returns {string} 微软目标语言代码
   */
  static toBingLangCode(code) {
    if (code === 'zh') {
      return 'zh-Hans';
    }
    return code || 'en';
  }

  static escapeHtmlText(text) {
    return String(text).replace(/[&<>]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;'
    }[char]));
  }

  static unescapeHtmlText(text) {
    return String(text).replace(/&(amp|lt|gt);/g, (match, entity) => ({
      amp: '&',
      lt: '<',
      gt: '>'
    }[entity] || match));
  }

  /**
   * 通过微软免费翻译接口翻译文本（无需 API Key，2026-07 后端点无需令牌）。
   * @param {string} text - 待翻译文本
   * @param {string} nativeLanguage - 用户母语代码（目标语言）
   * @param {AbortSignal} [signal] - 取消信号
   * @returns {Promise<string>} 翻译结果
   */
  static async translateViaBing(text, nativeLanguage, signal) {
    const target = this.toBingLangCode(nativeLanguage || 'zh');
    const url = `https://edge.microsoft.com/translate/translatetext?from=&to=${encodeURIComponent(target)}&isEnterpriseClient=false`;

    let response;
    for (let attempt = 0; attempt <= 1; attempt++) {
      response = await fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([this.escapeHtmlText(text)])
      });
      if (!response.ok && (response.status === 429 || response.status >= 500) && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      break;
    }

    if (!response.ok) {
      throw new Error(`Bing 翻译请求失败: HTTP ${response.status}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Bing 翻译返回了无法解析的内容。');
    }

    const result = data?.[0]?.translations?.[0]?.text;
    if (typeof result !== 'string') {
      throw new Error('Bing 翻译返回了空结果。');
    }
    return this.unescapeHtmlText(result);
  }
}

export default ApiService;

if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ApiService = ApiService;
}
