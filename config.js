// config.js - 配置管理模块

/**
 * 默认配置值
 */
const DEFAULT_CONFIG = {
  model: 'THUDM/GLM-4-9B-0414',
  customModelName: '',
  customModelEndpoint: '',
  apiKey: 'sk-yhszqcrexlxohbqlqjnxngoqenrtftzxvuvhdqzdjydtpoic',
  defaultApiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
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
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
        resolve(items);
      });
    });
  }

  /**
   * 保存配置
   * @param {object} config - 要保存的配置对象
   * @returns {Promise<void>}
   */
  static async save(config) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(config, () => {
        resolve();
      });
    });
  }

  /**
   * 获取默认配置
   * @returns {object} 默认配置对象的副本
   */
  static getDefaults() {
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 重置配置为默认值
   * @returns {Promise<object>} 重置后的配置对象
   */
  static async reset() {
    await this.save(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

// 同时支持 ES 模块导出和 Service Worker 导入
export default ConfigService;

// 在 Service Worker 环境中将其附加到全局对象
if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.ConfigService = ConfigService;
} 