// config.js - 配置管理模块

/**
 * 默认配置值
 */
const DEFAULT_CONFIG = {
  // 当前选择的模型
  currentModel: 'glm-4-9b',
  
  // 模型定义列表
  modelDefinitions: {
    // 免费模型
    'glm-4-9b': {
      name: 'THUDM/GLM-4-9B-0414',
      type: 'silicon-flow',
      apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
    },
    'qwen-7b': {
      name: 'Qwen/Qwen2.5-7B-Instruct',
      type: 'silicon-flow',
      apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
    },
    'qwen-coder-7b': {
      name: 'Qwen/Qwen2.5-Coder-7B-Instruct',
      type: 'silicon-flow',
      apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
    },
    'glm-4-9b-chat': {
      name: 'THUDM/glm-4-9b-chat',
      type: 'silicon-flow',
      apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
    },
    // 新增中科院大模型
    'glm-4-flash': {
      name: 'GLM-4-Flash',
      type: 'zhipu',
      apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    },
    'glm-4-flash-250414': {
      name: 'GLM-4-Flash-250414',
      type: 'zhipu',
      apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    }
  },
  
  // API密钥设置
  apiKeys: {
    'silicon-flow': '',
    'zhipu': ''
  },
  
  // 自定义模型设置
  customModel: {
    enabled: false,
    name: '',
    apiEndpoint: '',
    type: 'custom'
  }
};

/**
 * 配置服务类 - 处理配置的加载、保存和管理
 */
class ConfigService {
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
          
          // 确保各字段存在
          const config = {
            ...DEFAULT_CONFIG,
            ...items,
            // 确保modelDefinitions始终存在且包含所有默认模型
            modelDefinitions: {
              ...DEFAULT_CONFIG.modelDefinitions,
              ...(items.modelDefinitions || {})
            },
            apiKeys: {
              ...DEFAULT_CONFIG.apiKeys,
              ...(items.apiKeys || {})
            },
            customModel: {
              ...DEFAULT_CONFIG.customModel,
              ...(items.customModel || {})
            }
          };
          
          // 确保有效的currentModel
          if (!config.modelDefinitions[config.currentModel] && config.currentModel !== 'custom') {
            config.currentModel = DEFAULT_CONFIG.currentModel;
            console.warn(`无效的模型选择，重置为默认: ${config.currentModel}`);
          }
          
          console.log('配置加载成功', JSON.stringify({
            currentModel: config.currentModel,
            modelDefinitionsCount: Object.keys(config.modelDefinitions).length,
            apiKeySiliconFlow: config.apiKeys['silicon-flow'] ? '已设置' : '未设置',
            apiKeyZhipu: config.apiKeys['zhipu'] ? '已设置' : '未设置',
            customModelEnabled: Boolean(config.customModel.enabled)
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
   * 保存配置
   * @param {object} config - 要保存的配置对象
   * @returns {Promise<void>}
   */
  static async save(config) {
    return new Promise((resolve, reject) => {
      try {
        // 确保必要的字段存在
        const safeConfig = {
          ...DEFAULT_CONFIG,
          ...config,
          modelDefinitions: {
            ...DEFAULT_CONFIG.modelDefinitions,
            ...(config.modelDefinitions || {})
          },
          apiKeys: {
            ...DEFAULT_CONFIG.apiKeys,
            ...(config.apiKeys || {})
          },
          customModel: {
            ...DEFAULT_CONFIG.customModel,
            ...(config.customModel || {})
          }
        };
        
        // 记录日志
        console.log('正在保存配置...');
        
        chrome.storage.sync.set(safeConfig, () => {
          if (chrome.runtime.lastError) {
            console.error('Chrome存储错误:', chrome.runtime.lastError);
            reject(new Error(`保存设置失败: ${chrome.runtime.lastError.message}`));
          } else {
            console.log('配置保存成功');
            resolve();
          }
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
   * 获取当前选择的模型信息
   * @param {object} config - 配置对象
   * @returns {object} 当前选择的模型信息
   */
  static getCurrentModelInfo(config) {
    if (config.customModel && config.customModel.enabled) {
      return config.customModel;
    }
    
    return config.modelDefinitions[config.currentModel];
  }

  /**
   * 获取模型对应的API密钥
   * @param {object} config - 配置对象
   * @param {string} modelType - 模型类型
   * @returns {string} API密钥
   */
  static getApiKeyForModel(config, modelType) {
    return config.apiKeys[modelType] || '';
  }
}

// 同时支持 ES 模块导出和 Service Worker 导入
export default ConfigService;

// 在 Service Worker 环境中将其附加到全局对象
if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ConfigService = ConfigService;
} 