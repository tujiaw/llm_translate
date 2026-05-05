// config.js - 配置管理模块

/**
 * 默认配置（仅保留母语与通用模型列表）
 */
const DEFAULT_CONFIG = {
  nativeLanguage: 'zh',
  models: [],
  currentModelId: ''
};

/**
 * 配置服务类 - 处理配置的加载、保存和管理
 */
class ConfigService {
  /**
   * 深度合并对象，用于配置更新
   * @param {object} target - 目标对象
   * @param {object} source - 源对象
   * @returns {object} 合并后的对象
   * @private
   */
  static _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this._deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * 创建安全的配置对象，确保所有必要字段都存在
   * @param {object} config - 用户配置
   * @returns {object} 安全的配置对象
   * @private
   */
  static _createSafeConfig(config) {
    return this._deepMerge(DEFAULT_CONFIG, config || {});
  }

  /**
   * 生成新的模型条目 ID
   * @returns {string}
   */
  static newModelId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 规范化为仅包含通用字段的配置，并处理旧版 customModel 迁移
   * @param {object} config - 合并后的原始配置
   * @returns {object} 规范配置
   */
  static normalizeConfig(config) {
    let models = Array.isArray(config.models) ? config.models.map((m) => ({ ...m })) : [];
    let currentModelId = typeof config.currentModelId === 'string' ? config.currentModelId : '';

    if (models.length === 0 && config.customModel && config.customModel.enabled) {
      const cm = config.customModel;
      const hasLegacy = (cm.apiEndpoint || '').trim() || (cm.name || '').trim();
      if (hasLegacy) {
        const id = ConfigService.newModelId();
        models.push({
          id,
          label: (cm.name || '').trim() || 'Custom',
          baseUrl: (cm.apiEndpoint || '').trim(),
          model: (cm.name || '').trim(),
          apiKey: (cm.apiKey || '').trim(),
          bodyJson: '{}'
        });
        currentModelId = id;
      }
    }

    models = models.map((m) => {
      const rawJson = (m.bodyJson || '').trim();
      return {
        id: m.id || ConfigService.newModelId(),
        label: (m.label || '').trim(),
        baseUrl: (m.baseUrl || '').trim(),
        model: (m.model || '').trim(),
        apiKey: (m.apiKey || '').trim(),
        bodyJson: rawJson || '{}'
      };
    });

    if (!models.some((m) => m.id === currentModelId)) {
      currentModelId = models[0]?.id || '';
    }

    return {
      nativeLanguage: config.nativeLanguage || DEFAULT_CONFIG.nativeLanguage,
      models,
      currentModelId
    };
  }

  /**
   * 加载配置
   * @returns {Promise<object>} 配置对象
   */
  static async load() {
    return new Promise((resolve, reject) => {
      try {
        console.log('正在加载配置...');
        chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
          if (chrome.runtime.lastError) {
            console.error('Chrome存储错误:', chrome.runtime.lastError);
            reject(new Error(`加载设置失败: ${chrome.runtime.lastError.message}`));
            return;
          }

          const merged = this._createSafeConfig(items);
          const config = this.normalizeConfig(merged);

          console.log('配置加载成功', JSON.stringify({
            currentModelId: config.currentModelId,
            modelsCount: config.models.length
          }));

          resolve(config);
        });
      } catch (error) {
        console.error('加载配置时发生错误:', error);
        reject(error);
      }
    });
  }

  /**
   * 保存配置（仅写入通用字段，移除历史厂商相关键）
   * @param {object} config - 要保存的配置对象
   * @returns {Promise<void>}
   */
  static async save(config) {
    return new Promise((resolve, reject) => {
      try {
        const merged = this._createSafeConfig(config);
        const normalized = this.normalizeConfig(merged);

        const payload = {
          nativeLanguage: normalized.nativeLanguage,
          models: normalized.models,
          currentModelId: normalized.currentModelId
        };

        console.log('正在保存配置...');

        chrome.storage.sync.set(payload, () => {
          if (chrome.runtime.lastError) {
            console.error('Chrome存储错误:', chrome.runtime.lastError);
            reject(new Error(`保存设置失败: ${chrome.runtime.lastError.message}`));
            return;
          }
          const legacyKeys = ['modelDefinitions', 'modelGroups', 'apiKeys', 'customModel', 'currentModel'];
          chrome.storage.sync.remove(legacyKeys, () => {
            if (chrome.runtime.lastError) {
              console.warn('清理旧配置键时出错:', chrome.runtime.lastError);
            }
            console.log('配置保存成功');
            resolve();
          });
        });
      } catch (error) {
        console.error('保存配置时发生错误:', error);
        reject(error);
      }
    });
  }

  /**
   * 获取默认配置
   * @returns {object} 默认配置对象的副本
   */
  static getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  /**
   * 重置配置为默认值
   * @returns {Promise<object>} 重置后的配置对象
   */
  static async reset() {
    await this.save(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  /**
   * 当前选中的模型条目（无选中或未配置时返回 null）
   * @param {object} config - 配置对象
   * @returns {object|null}
   */
  static getCurrentModel(config) {
    if (!config || !Array.isArray(config.models)) {
      return null;
    }
    return config.models.find((m) => m.id === config.currentModelId) || null;
  }
}

export default ConfigService;

if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ConfigService = ConfigService;
}
