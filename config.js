// config.js - 配置管理模块

const DEFAULT_CONFIG = {
  nativeLanguage: 'zh',
  models: [],
  currentModelId: ''
};

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
    let models = Array.isArray(config.models) ? config.models.map((item) => ({ ...item })) : [];
    let currentModelId = typeof config.currentModelId === 'string' ? config.currentModelId : '';

    if (models.length === 0 && config.customModel && config.customModel.enabled) {
      const customModel = config.customModel;
      const hasLegacy = (customModel.apiEndpoint || '').trim() || (customModel.name || '').trim();
      if (hasLegacy) {
        const modelName = (customModel.name || '').trim();
        models.push({
          id: ConfigService.identityKey('custom', modelName),
          providerId: 'custom',
          baseUrl: (customModel.apiEndpoint || '').trim(),
          model: modelName,
          apiKey: (customModel.apiKey || '').trim(),
          bodyJson: '{}'
        });
      }
    }

    const merged = [];
    const indexByKey = new Map();
    let resolvedCurrent = '';
    models.forEach((item) => {
      const rawJson = (item.bodyJson || '').trim();
      const baseUrl = (item.baseUrl || '').trim();
      const providerId = ConfigService.inferProviderId(baseUrl, item.providerId);
      const model = (item.model || '').trim();
      const key = ConfigService.identityKey(providerId, model);
      const normalized = {
        id: key,
        providerId,
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
      resolvedCurrent = models[0]?.id || '';
    }

    return {
      nativeLanguage: config.nativeLanguage || DEFAULT_CONFIG.nativeLanguage,
      models,
      currentModelId: resolvedCurrent
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
      currentModelId: normalized.currentModelId
    };
  }

  static async load() {
    const localItems = await this._storageGet('local', DEFAULT_CONFIG);
    const localConfig = this.normalizeConfig(this._createSafeConfig(localItems));
    if (localConfig.models.length > 0) {
      return localConfig;
    }

    try {
      const syncItems = await this._storageGet('sync', DEFAULT_CONFIG);
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

export { MODEL_PROVIDERS };
export default ConfigService;

if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ConfigService = ConfigService;
}
