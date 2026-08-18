// config.js - 配置管理模块

const DEFAULT_CONFIG = {
  nativeLanguage: 'zh',
  models: [],
  currentModelId: '',
  maxApiCalls: 10,
  concurrentApiCalls: 3,
  translationDisplayMode: 'bilingual',
  ignoredPageRegions: ['header', 'footer']
};

// 整页翻译可忽略的页面区域（id 与设置面板展示名）
const PAGE_REGION_OPTIONS = [
  { id: 'header', name: '页头 <header>' },
  { id: 'footer', name: '页脚 <footer>' },
  { id: 'nav', name: '导航栏 <nav>' },
  { id: 'aside', name: '侧边栏 <aside>' },
  { id: 'form', name: '表单 <form>' },
  { id: 'dialog', name: '弹窗/对话框 [role=dialog]' }
];

function clampInteger(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, parsed));
}

const MODEL_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    hint: '在 platform.deepseek.com 创建 API Key'
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    hint: '在 siliconflow.cn 创建 API Key'
  },
  {
    id: 'dashscope',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    hint: '在 dashscope.console.aliyun.com 创建 API Key'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    hint: '在 open.bigmodel.cn 创建 API Key'
  },
  {
    id: 'moonshot',
    name: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    hint: '在 platform.moonshot.cn 创建 API Key'
  },
  {
    id: 'volcengine',
    name: '豆包 / 火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-32k',
    hint: '填写方舟推理接入点 ID 作为模型名'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    hint: '在 platform.openai.com 创建 API Key'
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    hint: '在 console.groq.com 创建 API Key'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    hint: '在 openrouter.ai 创建 API Key'
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    hint: '本地需先启动 Ollama，API Key 可填 ollama'
  },
  {
    id: 'bing',
    name: 'Bing 翻译',
    type: 'bing',
    baseUrl: '',
    defaultModel: '',
    hint: '使用微软免费翻译接口，无需 API Key'
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    defaultModel: '',
    hint: '填写兼容 Chat Completions 的接口地址，可只写到 /v1'
  }
];

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

  static findByIdentity(models, providerId, model) {
    const key = this.identityKey(providerId, model);
    return (models || []).find((item) => this.identityKey(item.providerId, item.model) === key) || null;
  }

  static createModelEntry(providerId = 'deepseek') {
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

  static nextUnusedEntry(models) {
    for (const provider of MODEL_PROVIDERS) {
      const created = this.createModelEntry(provider.id);
      if (!this.findByIdentity(models, created.providerId, created.model)) {
        return created;
      }
    }
    const fallback = this.createModelEntry('custom');
    fallback.model = `custom-${Date.now().toString(36)}`;
    fallback.id = this.identityKey(fallback.providerId, fallback.model);
    return fallback;
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

  static _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      const value = source[key];
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this._deepMerge(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  static _createSafeConfig(config) {
    return this._deepMerge(DEFAULT_CONFIG, config || {});
  }

  static normalizeConfig(config) {
    // 过滤已下线的 Google 翻译条目，避免残留空配置
    let models = Array.isArray(config.models)
      ? config.models
          .filter((item) => (item.serviceType || item.providerId) !== 'google')
          .map((item) => ({ ...item }))
      : [];
    let currentModelId = typeof config.currentModelId === 'string' ? config.currentModelId : '';
    let legacySelectedKey = '';

    // 旧版自定义模型（customModel）迁移：可识别到内置服务商时自动归位（如 deepseek 自定义端点 → deepseek 服务商）
    if (models.length === 0 && config.customModel && config.customModel.enabled) {
      const customModel = config.customModel;
      const hasLegacy = (customModel.apiEndpoint || '').trim() || (customModel.name || '').trim();
      if (hasLegacy) {
        const modelName = (customModel.name || '').trim();
        // 不传 type：customModel.type 固定为 "custom"，会让 inferProviderId 短路，
        // 导致 hostname 匹配不到 deepseek 等服务商
        const providerId = ConfigService.inferProviderId(customModel.apiEndpoint);
        models.push({
          id: ConfigService.identityKey(providerId, modelName),
          providerId,
          baseUrl: (customModel.apiEndpoint || '').trim(),
          model: modelName,
          apiKey: (customModel.apiKey || '').trim(),
          bodyJson: '{}'
        });
      }
    }

    // 更早版本（1.0.2 及以前）的 modelDefinitions + apiKeys + currentModel 迁移
    if (models.length === 0 && config.modelDefinitions && typeof config.modelDefinitions === 'object') {
      const legacyApiKeys = (config.apiKeys && typeof config.apiKeys === 'object') ? config.apiKeys : {};
      const legacySelected = typeof config.currentModel === 'string' ? config.currentModel : '';
      const migrated = [];
      for (const defId of Object.keys(config.modelDefinitions)) {
        const def = config.modelDefinitions[defId];
        if (!def || typeof def !== 'object') {
          continue;
        }
        const name = (def.name || '').trim();
        const endpoint = (def.apiEndpoint || '').trim();
        if (!name || !endpoint) {
          continue;
        }
        const providerId = ConfigService.inferProviderId(endpoint, def.type);
        const key = ConfigService.identityKey(providerId, name);
        migrated.push({
          id: key,
          providerId,
          baseUrl: endpoint,
          model: name,
          // 旧版 apiKeys 用 "silicon-flow" 之类旧名，与新 providerId 可能不同，两种都尝试
          apiKey: (legacyApiKeys[providerId] || legacyApiKeys[def.type] || '').trim(),
          bodyJson: '{}'
        });
        if (defId === legacySelected) {
          legacySelectedKey = key;
        }
      }
      if (migrated.length > 0) {
        models = migrated;
      }
    }

    const merged = [];
    const indexByKey = new Map();
    let resolvedCurrent = '';
    models.forEach((item) => {
      const rawJson = (item.bodyJson || '').trim();
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
        bodyJson: rawJson || '{}'
      };

      if (item.id === currentModelId || key === currentModelId) {
        resolvedCurrent = key;
      }

      if (!indexByKey.has(key)) {
        indexByKey.set(key, merged.length);
        merged.push(normalized);
        return;
      }

      const existingIndex = indexByKey.get(key);
      const existing = merged[existingIndex];
      if (!(existing.apiKey || '').trim() && normalized.apiKey) {
        merged[existingIndex] = normalized;
      }
    });

    models = merged;
    if (!models.some((item) => item.id === resolvedCurrent)) {
      resolvedCurrent = legacySelectedKey || models[0]?.id || '';
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
      ignoredPageRegions
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

  static _toPayload(config) {
    const normalized = this.normalizeConfig(this._createSafeConfig(config));
    return {
      nativeLanguage: normalized.nativeLanguage,
      models: normalized.models,
      currentModelId: normalized.currentModelId,
      maxApiCalls: normalized.maxApiCalls,
      concurrentApiCalls: normalized.concurrentApiCalls,
      translationDisplayMode: normalized.translationDisplayMode,
      ignoredPageRegions: normalized.ignoredPageRegions
    };
  }

  static async load() {
    // 读取全部键（get(null)），否则 get(DEFAULT_CONFIG) 只返回 DEFAULT_CONFIG 内的键，
    // 旧版的 customModel / modelDefinitions / apiKeys / currentModel 等键读不到，配置会被当成"空"。
    const localItems = await this._storageGet('local', null);
    const localConfig = this.normalizeConfig(this._createSafeConfig(localItems));
    if (localConfig.models.length > 0) {
      return localConfig;
    }

    try {
      const syncItems = await this._storageGet('sync', null);
      const syncConfig = this.normalizeConfig(this._createSafeConfig(syncItems));
      if (syncConfig.models.length > 0) {
        await this._storageSet('local', this._toPayload(syncConfig));
        return syncConfig;
      }
    } catch (error) {
      console.warn('读取旧版同步配置失败，将使用本地配置:', error);
    }

    return localConfig;
  }

  static async save(config) {
    const payload = this._toPayload(config);
    await this._storageSet('local', payload);
    // 清理旧版配置键，避免与 models 新 schema 并存造成困惑（尽力而为，不阻塞保存）
    const legacyKeys = ['modelDefinitions', 'modelGroups', 'apiKeys', 'customModel', 'currentModel'];
    chrome.storage.local.remove(legacyKeys, () => {
      if (chrome.runtime.lastError) {
        console.warn('清理旧配置键时出错:', chrome.runtime.lastError);
      }
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
