// config.js - 配置管理模块

const DEFAULT_CONFIG = {
  nativeLanguage: 'zh',
  models: [],
  currentModelId: '',
  maxApiCalls: 10,
  concurrentApiCalls: 3,
  translationDisplayMode: 'bilingual',
  ignoredPageRegions: ['header', 'footer'],
  textSelectionEnabled: true,
  // 在默认「跟随选区」按钮位置上再偏移的像素数，避免与其他插件的按钮重叠
  selectionOffsetX: 0,
  selectionOffsetY: 0
};

// 整页翻译可忽略的页面区域（id 与设置面板展示名）
const PAGE_REGION_OPTIONS = [
  { id: 'header', name: '页头' },
  { id: 'footer', name: '页脚' },
  { id: 'nav', name: '导航栏' },
  { id: 'aside', name: '侧边栏' },
  { id: 'form', name: '表单' },
  { id: 'dialog', name: '弹窗/对话框' }
];

// 服务商列表：Bing 置顶（免费免 Key），随后为国内外主流 LLM 厂商
const MODEL_PROVIDERS = [
  {
    id: 'bing',
    name: 'Bing 翻译',
    type: 'bing',
    baseUrl: '',
    defaultModel: '',
    hint: '使用微软免费翻译接口，无需 API Key'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    hint: '在 platform.deepseek.com 创建 API Key'
  },
  {
    id: 'dashscope',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.6-flash',
    hint: '在 dashscope.console.aliyun.com 创建 API Key'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4.7-flash',
    hint: '在 open.bigmodel.cn 创建 API Key'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5-mini',
    hint: '在 platform.openai.com 创建 API Key'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3-flash-preview',
    hint: '在 aistudio.google.com 创建 API Key'
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    defaultModel: '',
    hint: '填写兼容 Chat Completions 的接口地址，可只写到 /v1'
  }
];

function clampInteger(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, parsed));
}

function clampOffset(value, fallback, limit = 50) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(limit, Math.max(-limit, parsed));
}

class ConfigService {
  static getProviders() {
    return MODEL_PROVIDERS;
  }

  static getPageRegionOptions() {
    return PAGE_REGION_OPTIONS;
  }

  static getProvider(providerId) {
    return MODEL_PROVIDERS.find((item) => item.id === providerId)
      || MODEL_PROVIDERS[MODEL_PROVIDERS.length - 1];
  }

  static inferProviderId(baseUrl, providerId) {
    if (providerId && MODEL_PROVIDERS.some((item) => item.id === providerId)) {
      return providerId;
    }

    const raw = (baseUrl || '').trim().toLowerCase();
    if (!raw) {
      return 'custom';
    }

    for (const provider of MODEL_PROVIDERS) {
      if (provider.id === 'custom' || !provider.baseUrl) {
        continue;
      }
      try {
        const host = new URL(provider.baseUrl).hostname.toLowerCase();
        if (raw.includes(host)) {
          return provider.id;
        }
      } catch {
        continue;
      }
    }

    return 'custom';
  }

  static identityKey(providerId, model) {
    const provider = (providerId || 'custom').trim() || 'custom';
    const modelId = (model || '').trim().toLowerCase();
    return `${provider}::${modelId}`;
  }

  static displayName(entry) {
    if (!entry) {
      return '未配置';
    }
    const provider = this.getProvider(entry.providerId);
    const model = (entry.model || '').trim();
    const name = provider ? provider.name : '自定义（OpenAI 兼容）';
    if (model) {
      return `${name} · ${model}`;
    }
    return name;
  }

  static createModelEntry(providerId = 'bing') {
    const provider = this.getProvider(providerId);
    const model = provider.defaultModel || '';
    return {
      id: this.identityKey(provider.id, model),
      providerId: provider.id,
      serviceType: provider.type || 'llm',
      baseUrl: provider.baseUrl,
      model,
      apiKey: '',
      bodyJson: '{}'
    };
  }

  static isModelReady(entry) {
    if (!entry) {
      return false;
    }
    if (entry.serviceType === 'bing') {
      return Boolean(entry.providerId);
    }
    return Boolean(
      (entry.baseUrl || '').trim()
      && (entry.model || '').trim()
      && (entry.apiKey || '').trim()
    );
  }

  // 只做基础清洗：字段兜底、按服务商+模型ID 去重、整数钳制
  static normalizeConfig(config) {
    const models = [];
    const indexByKey = new Map();
    let resolvedCurrent = '';

    (Array.isArray(config.models) ? config.models : []).forEach((item) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const baseUrl = (item.baseUrl || '').trim();
      const providerId = ConfigService.inferProviderId(baseUrl, item.providerId);
      const serviceType = ConfigService.getProvider(providerId).type || 'llm';
      const model = (item.model || '').trim();
      const key = ConfigService.identityKey(providerId, model);
      const normalized = {
        id: key,
        providerId,
        serviceType,
        baseUrl,
        model,
        apiKey: (item.apiKey || '').trim(),
        bodyJson: (item.bodyJson || '').trim() || '{}'
      };

      if (item.id === config.currentModelId || key === config.currentModelId) {
        resolvedCurrent = key;
      }

      if (!indexByKey.has(key)) {
        indexByKey.set(key, models.length);
        models.push(normalized);
      } else if (!models[indexByKey.get(key)].apiKey && normalized.apiKey) {
        models[indexByKey.get(key)] = normalized;
      }
    });

    if (!models.some((item) => item.id === resolvedCurrent)) {
      resolvedCurrent = models[0]?.id || '';
    }

    const validRegionIds = new Set(PAGE_REGION_OPTIONS.map((item) => item.id));
    const ignoredPageRegions = Array.isArray(config.ignoredPageRegions)
      ? config.ignoredPageRegions.filter((id) => validRegionIds.has(id))
      : ['header', 'footer'];

    return {
      nativeLanguage: config.nativeLanguage || DEFAULT_CONFIG.nativeLanguage,
      models,
      currentModelId: resolvedCurrent,
      maxApiCalls: clampInteger(config.maxApiCalls, DEFAULT_CONFIG.maxApiCalls, 50),
      concurrentApiCalls: clampInteger(
        config.concurrentApiCalls,
        DEFAULT_CONFIG.concurrentApiCalls,
        20
      ),
      translationDisplayMode: config.translationDisplayMode === 'replace'
        ? 'replace'
        : DEFAULT_CONFIG.translationDisplayMode,
      ignoredPageRegions,
      textSelectionEnabled: config.textSelectionEnabled !== false,
      selectionOffsetX: clampOffset(config.selectionOffsetX, DEFAULT_CONFIG.selectionOffsetX),
      selectionOffsetY: clampOffset(config.selectionOffsetY, DEFAULT_CONFIG.selectionOffsetY)
    };
  }

  static _storageGet(area, defaults) {
    return new Promise((resolve, reject) => {
      chrome.storage[area].get(defaults, (items) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`读取${area}存储失败: ${chrome.runtime.lastError.message}`));
          return;
        }
        resolve(items || {});
      });
    });
  }

  static _storageSet(area, payload) {
    return new Promise((resolve, reject) => {
      chrome.storage[area].set(payload, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`写入${area}存储失败: ${chrome.runtime.lastError.message}`));
          return;
        }
        resolve();
      });
    });
  }

  static async load() {
    const items = await this._storageGet('local', null);
    return this.normalizeConfig({ ...DEFAULT_CONFIG, ...(items || {}) });
  }

  static async save(config) {
    const normalized = this.normalizeConfig({ ...DEFAULT_CONFIG, ...config });
    await this._storageSet('local', {
      nativeLanguage: normalized.nativeLanguage,
      models: normalized.models,
      currentModelId: normalized.currentModelId,
      maxApiCalls: normalized.maxApiCalls,
      concurrentApiCalls: normalized.concurrentApiCalls,
      translationDisplayMode: normalized.translationDisplayMode,
      ignoredPageRegions: normalized.ignoredPageRegions,
      textSelectionEnabled: normalized.textSelectionEnabled,
      selectionOffsetX: normalized.selectionOffsetX,
      selectionOffsetY: normalized.selectionOffsetY
    });
  }

  static getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  static async reset() {
    await this.save(DEFAULT_CONFIG);
    return this.getDefaults();
  }

  static getCurrentModel(config) {
    if (!config || !Array.isArray(config.models)) {
      return null;
    }
    return config.models.find((item) => item.id === config.currentModelId) || null;
  }
}

export { MODEL_PROVIDERS, PAGE_REGION_OPTIONS };
export default ConfigService;

if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ConfigService = ConfigService;
}
