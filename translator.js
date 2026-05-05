// translator.js - 翻译服务模块

import ApiService from './api.js';
import ConfigService from './config.js';

/**
 * 翻译服务类 - 整合API调用和翻译逻辑
 */
class TranslatorService {
  /**
   * 执行翻译操作
   * @param {string} text - 要翻译的文本
   * @returns {Promise<string>} 翻译结果
   */
  static async translate(text) {
    if (!text || text.trim() === '') {
      throw new Error('没有提供要翻译的文本');
    }

    const config = await ConfigService.load();
    return ApiService.translate(text, config);
  }
}

export default TranslatorService;
