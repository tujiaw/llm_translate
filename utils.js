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
   * 检测文本所使用的语言
   * @param {string} text - 要检测的文本
   * @returns {string} 检测到的语言代码
   */
  static detectLanguage(text) {
    if (!text || text.trim() === '') {
      return 'unknown';
    }
    
    // 常见语言的字符范围和特征
    const langPatterns = [
      { code: 'zh', name: '中文', pattern: /[\u4e00-\u9fa5]/ },
      { code: 'ja', name: '日语', pattern: /[\u3040-\u309F\u30A0-\u30FF]/ },
      { code: 'ko', name: '韩语', pattern: /[\uAC00-\uD7AF\u1100-\u11FF]/ },
      { code: 'ru', name: '俄语', pattern: /[\u0400-\u04FF]/ },
      { code: 'ar', name: '阿拉伯语', pattern: /[\u0600-\u06FF]/ },
      { code: 'hi', name: '印地语', pattern: /[\u0900-\u097F]/ },
      { code: 'he', name: '希伯来语', pattern: /[\u0590-\u05FF]/ },
      { code: 'th', name: '泰语', pattern: /[\u0E00-\u0E7F]/ },
      // 西欧语言(英语、法语、德语、西班牙语等)使用拉丁字母，需要更复杂的统计方法区分
    ];
    
    // 先检查非拉丁系统的语言，这些更容易通过字符集识别
    for (const lang of langPatterns) {
      if (lang.pattern.test(text)) {
        return lang.code;
      }
    }
    
    // 拉丁系统语言的简单区分方法 - 基于特殊字符和常用单词
    // 注意：这是一个简化方法，准确性有限
    if (/[àáâäæãåāèéêëēėęîïíīįìôöòóœøōõûüùúū]/i.test(text)) {
      // 含有重音符号的拉丁文字
      if (/[ñ]|(?:\b(?:el|la|los|las|es|y|muy|con)\b)/i.test(text)) {
        return 'es'; // 西班牙语
      } else if (/[ç]|(?:\b(?:le|la|les|des|du|et|en|sur|je|tu|il|nous|vous|ils)\b)/i.test(text)) {
        return 'fr'; // 法语
      } else if (/[ß]|(?:\b(?:der|die|das|ein|eine|und|oder|ist|sind|nicht|für|mit)\b)/i.test(text)) {
        return 'de'; // 德语
      } else if (/(?:\b(?:di|il|la|e|che|per|un|una|sono|questo)\b)/i.test(text)) {
        return 'it'; // 意大利语
      }
      return 'other-latin'; // 其他拉丁字母语言
    }
    
    // 默认假设为英语 (所有拉丁字母且没有特殊重音符号的情况)
    return 'en';
  }
  

  /**
   * 获取语言的英文名称
   * @param {string} langCode - 语言代码
   * @returns {string} 语言的英文名称
   */
  static getLanguageNameInEnglish(langCode) {
    const languages = {
      'zh': 'Chinese',
      'en': 'English',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ru': 'Russian',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'it': 'Italian',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'he': 'Hebrew',
      'th': 'Thai',
      'other-latin': 'Other Latin',
      'unknown': 'Unknown'
    };
    
    return languages[langCode] || 'Unknown';
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
  
  /**
   * 获取支持的语言列表
   * @returns {Array} 语言选项列表，包含code和name
   */
  static getSupportedLanguages() {
    return [
      { code: 'zh', name: '中文' },
      { code: 'en', name: '英语' },
      { code: 'ja', name: '日语' },
      { code: 'ko', name: '韩语' },
      { code: 'ru', name: '俄语' },
      { code: 'fr', name: '法语' },
      { code: 'de', name: '德语' },
      { code: 'es', name: '西班牙语' },
      { code: 'it', name: '意大利语' },
      { code: 'ar', name: '阿拉伯语' },
      { code: 'hi', name: '印地语' },
      { code: 'he', name: '希伯来语' },
      { code: 'th', name: '泰语' }
    ];
  }

  /**
   * 获取支持的语言列表(英文表示)
   * @returns {Array} 语言选项列表，包含code和name(英文)
   */
  static getSupportedLanguagesInEnglish() {
    return [
      { code: 'zh', name: 'Chinese' },
      { code: 'en', name: 'English' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'ru', name: 'Russian' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'es', name: 'Spanish' },
      { code: 'it', name: 'Italian' },
      { code: 'ar', name: 'Arabic' },
      { code: 'hi', name: 'Hindi' },
      { code: 'he', name: 'Hebrew' },
      { code: 'th', name: 'Thai' }
    ];
  }
}

// 导出工具类
export default Utils; 