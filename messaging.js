// messaging.js - 处理扩展组件间的消息通信

/**
 * 消息服务类 - 处理扩展组件间的消息传递
 */
class MessagingService {
  static isExtensionActive = true;

  /**
   * 处理扩展上下文失效
   */
  static handleExtensionInvalidation() {
    this.isExtensionActive = false;
    console.warn('扩展上下文已失效，某些功能可能无法正常工作');
  }

  /**
   * 安全发送消息到后台脚本
   * @param {object} message - 消息对象
   * @param {number} [timeout=30000] - 超时时间(毫秒)
   * @returns {Promise<any>} 消息响应
   */
  static async sendMessage(message, timeout = 30000) {
    if (!this.isExtensionActive) {
      throw new Error('扩展上下文已失效，无法发送消息');
    }

    return new Promise((resolve, reject) => {
      // 设置超时处理
      const timeoutId = setTimeout(() => {
        reject(new Error('消息响应超时'));
      }, timeout);
      
      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeoutId); // 清除超时计时器
          
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            console.error('发送消息出错:', error.message);
            if (error.message && error.message.includes('Extension context invalidated')) {
              this.handleExtensionInvalidation();
            }
            reject(new Error(error.message || '发送消息时出错'));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        clearTimeout(timeoutId); // 清除超时计时器
        console.error('发送消息异常:', error);
        if (error.message && error.message.includes('Extension context invalidated')) {
          this.handleExtensionInvalidation();
        }
        reject(error);
      }
    });
  }

  /**
   * 安全发送消息到内容脚本
   * @param {number} tabId - 标签页ID
   * @param {object} message - 消息对象
   * @returns {Promise<any>} 消息响应
   */
  static async sendMessageToTab(tabId, message) {
    if (!this.isExtensionActive) {
      throw new Error('扩展上下文已失效，无法发送消息');
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            if (error.message && error.message.includes('Extension context invalidated')) {
              this.handleExtensionInvalidation();
            }
            reject(new Error(error.message || '发送消息时出错'));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        if (error.message && error.message.includes('Extension context invalidated')) {
          this.handleExtensionInvalidation();
        }
        reject(error);
      }
    });
  }

  /**
   * 注册消息监听器
   * @param {Function} callback - 消息处理回调函数
   */
  static registerMessageListener(callback) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
        const result = callback(request, sender);
        
        // 处理异步回调
        if (result instanceof Promise) {
          // 为异步Promise设置超时保护
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('处理消息超时')), 25000);
          });
          
          // 竞争Promise
          Promise.race([result, timeoutPromise])
            .then(data => {
              try {
                sendResponse(data);
              } catch (err) {
                console.error('发送响应时出错:', err);
              }
            })
            .catch(error => {
              console.error('处理异步消息时出错:', error);
              try {
                sendResponse({ error: error.message });
              } catch (err) {
                console.error('发送错误响应时出错:', err);
              }
            });
            
          return true; // 保持通道开放，异步响应
        } else if (result !== undefined) {
          // 同步结果直接返回
          sendResponse(result);
          return false; // 不需要保持通道开放
        }
      } catch (error) {
        console.error('处理消息时出错:', error);
        if (error.message && error.message.includes('Extension context invalidated')) {
          this.handleExtensionInvalidation();
        }
        try {
          sendResponse({ error: error.message });
        } catch (err) {
          console.error('发送错误响应时出错:', err);
        }
      }
      return false; // 默认不保持通道开放
    });
  }

  /**
   * 设置扩展上下文监听器（检测扩展何时失效）
   */
  static setupExtensionContextListeners() {
    // 尝试设置消息监听，如果失败则标记扩展为非活动状态
    try {
      chrome.runtime.onMessageExternal.addListener(() => {});
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        this.handleExtensionInvalidation();
      }
    }

    // 监听连接断开
    chrome.runtime.onConnect.addListener(port => {
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            this.handleExtensionInvalidation();
          }
        }
      });
    });
  }
}

// 同时支持 ES 模块导出和 Service Worker 导入
export default MessagingService;

// 在 Service Worker 环境中将其附加到全局对象
if (typeof self !== 'undefined' && self.constructor && self.constructor.name === 'ServiceWorkerGlobalScope') {
  self.MessagingService = MessagingService;
} 