// utils.js - 通用辅助工具函数

/**
 * 工具函数类 - 提供各种通用的辅助功能
 */
class Utils {
  /**
   * 检测文本是否包含中文字符
   * @param {string} text - 要检测的文本
   * @returns {boolean} 是否包含中文
   */
  static isChineseText(text) {
    return /[\u4e00-\u9fa5]/.test(text);
  }

  /**
   * 截断文本，如果过长则添加省略号
   * @param {string} text - 要截断的文本
   * @param {number} maxLength - 最大长度
   * @returns {string} 截断后的文本
   */
  static truncateText(text, maxLength = 100) {
    if (text && text.length > maxLength) {
      return text.substring(0, maxLength) + '...';
    }
    return text;
  }

  /**
   * 获取带有参数的URL
   * @param {string} baseUrl - 基础URL
   * @param {object} params - URL参数对象
   * @returns {string} 完整URL
   */
  static getUrlWithParams(baseUrl, params = {}) {
    const url = new URL(baseUrl);
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });
    return url.toString();
  }

  /**
   * 防抖函数 - 在一定时间内只执行最后一次
   * @param {Function} func - 要防抖的函数
   * @param {number} wait - 等待时间(毫秒)
   * @returns {Function} 防抖后的函数
   */
  static debounce(func, wait = 300) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(this, args);
      }, wait);
    };
  }

  /**
   * 节流函数 - 在一定时间内最多执行一次
   * @param {Function} func - 要节流的函数
   * @param {number} limit - 执行间隔(毫秒)
   * @returns {Function} 节流后的函数
   */
  static throttle(func, limit = 300) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * 确保函数只执行一次
   * @param {Function} func - 要执行的函数
   * @returns {Function} 包装后的函数
   */
  static once(func) {
    let called = false;
    let result;
    return function(...args) {
      if (!called) {
        called = true;
        result = func.apply(this, args);
      }
      return result;
    };
  }

  /**
   * 安全地解析JSON字符串
   * @param {string} jsonString - JSON字符串
   * @param {*} defaultValue - 解析失败时的默认值
   * @returns {*} 解析结果或默认值
   */
  static safeJsonParse(jsonString, defaultValue = {}) {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      console.error('JSON解析错误:', e);
      return defaultValue;
    }
  }
  
  /**
   * 生成唯一ID
   * @returns {string} 唯一ID
   */
  static generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}

// 导出工具类
export default Utils; 