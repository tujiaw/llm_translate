// background.js - 后台脚本

// 使用静态导入
import ConfigService from './config.js';
import ApiService from './api.js';
import TranslatorService from './translator.js';
import Utils from './utils.js';

console.log('LLM翻译扩展后台脚本已加载');

// ==================== 常量定义 ====================
const CONSTANTS = {
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY_MS: 1000
  },
  MENU_IDS: {
    TRANSLATE_WEBPAGE: 'translateWebpage',
    CLEAR_TRANSLATIONS: 'clearTranslations'
  },
  ACTIONS: {
    TRANSLATE_WEBPAGE: 'translateWebpage',
    CLEAR_WEBPAGE_TRANSLATIONS: 'clearWebpageTranslations',
    PERFORM_TRANSLATION: 'performTranslation',
    GET_CONFIG: 'getConfig',
    TRANSLATE: 'translate'
  },
  ERROR_MESSAGES: {
    CONNECTION_FAILED: ['Could not establish connection', 'Receiving end does not exist'],
    SCRIPT_NOT_READY: ['Script not ready', 'Script not ready after waiting']
  }
};

// ==================== 初始化 ====================
initializeExtension();

function initializeExtension() {
  initializeConfig();
  setupMessageListeners();
  // createContextMenus();
}

// ==================== 配置管理 ====================
/**
 * 初始化配置
 */
async function initializeConfig() {
  try {
    const config = await ConfigService.load();
    logConfigInfo(config, '已加载');
    
    if (!isConfigComplete(config)) {
      console.log('配置不完整，重置为默认值');
      ConfigService.reset();
    } else {
      console.log('已有完整配置，无需设置默认值');
    }
  } catch (error) {
    console.error('初始化配置时出错:', error);
  }
}

/**
 * 检查配置是否完整
 * @param {Object} config - 配置对象
 * @returns {boolean} - 配置是否完整
 */
function isConfigComplete(config) {
  return config.modelDefinitions && Object.keys(config.modelDefinitions).length > 0;
}

/**
 * 记录配置信息
 * @param {Object} config - 配置对象
 * @param {string} prefix - 日志前缀
 */
function logConfigInfo(config, prefix = '') {
  console.log(`${prefix}配置信息:`, JSON.stringify({
    currentModel: config.currentModel,
    hasModelDefinitions: Boolean(config.modelDefinitions),
    modelDefinitionsCount: config.modelDefinitions ? Object.keys(config.modelDefinitions).length : 0,
    hasApiKeys: Boolean(config.apiKeys),
    apiKeysSiliconFlow: Boolean(config.apiKeys?.['silicon-flow']),
    apiKeysZhipu: Boolean(config.apiKeys?.['zhipu']),
    customModelEnabled: Boolean(config.customModel?.enabled)
  }));
}

// ==================== 右键菜单管理 ====================
/**
 * 创建浏览器右键菜单
 */
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    const menuItems = [
      {
        id: CONSTANTS.MENU_IDS.TRANSLATE_WEBPAGE,
        title: '翻译当前网页',
        contexts: ['page', 'frame']
      },
      {
        id: CONSTANTS.MENU_IDS.CLEAR_TRANSLATIONS,
        title: '清除页面翻译',
        contexts: ['page', 'frame']
      }
    ];

    menuItems.forEach(item => chrome.contextMenus.create(item));
    
    chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
    console.log('已创建右键菜单');
  });
}

/**
 * 处理右键菜单点击事件
 * @param {Object} info - 菜单信息
 * @param {Object} tab - 当前标签页对象
 */
function handleContextMenuClick(info, tab) {
  if (!isValidTab(tab)) {
    console.error('无法获取当前标签页信息');
    return;
  }

  const menuHandlers = {
    [CONSTANTS.MENU_IDS.TRANSLATE_WEBPAGE]: () => handleWebpageTranslation(tab),
    [CONSTANTS.MENU_IDS.CLEAR_TRANSLATIONS]: () => handleClearTranslations(tab)
  };

  const handler = menuHandlers[info.menuItemId];
  if (handler) {
    handler();
  }
}

/**
 * 验证标签页是否有效
 * @param {Object} tab - 标签页对象
 * @returns {boolean} - 是否有效
 */
function isValidTab(tab) {
  return tab && tab.id;
}

// ==================== 网页翻译处理 ====================
/**
 * 处理网页翻译请求
 * @param {Object} tab - 当前标签页对象
 */
function handleWebpageTranslation(tab) {
  console.log('开始翻译网页');
  sendMessageWithRetry(tab.id, { action: CONSTANTS.ACTIONS.TRANSLATE_WEBPAGE }, '翻译网页');
}

/**
 * 处理清除翻译请求
 * @param {Object} tab - 当前标签页对象
 */
function handleClearTranslations(tab) {
  console.log('清除页面翻译:', tab.url);
  sendMessageWithRetry(tab.id, { action: CONSTANTS.ACTIONS.CLEAR_WEBPAGE_TRANSLATIONS }, '清除翻译');
}

// ==================== 通用消息发送系统 ====================
/**
 * 发送消息并支持重试机制
 * @param {number} tabId - 标签页ID
 * @param {Object} message - 要发送的消息
 * @param {string} operationName - 操作名称（用于日志）
 * @param {number} retryCount - 当前重试次数
 */
function sendMessageWithRetry(tabId, message, operationName, retryCount = 0) {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    const error = chrome.runtime.lastError;
    
    if (error) {
      handleMessageError(error, tabId, message, operationName, retryCount);
      return;
    }

    if (isResponseFailure(response)) {
      handleResponseFailure(response, tabId, message, operationName, retryCount);
      return;
    }

    console.log(`${operationName}请求成功，响应:`, response);
  });
}

/**
 * 处理消息发送错误
 * @param {Object} error - Chrome runtime 错误
 * @param {number} tabId - 标签页ID
 * @param {Object} message - 原始消息
 * @param {string} operationName - 操作名称
 * @param {number} retryCount - 重试次数
 */
function handleMessageError(error, tabId, message, operationName, retryCount) {
  console.error(`发送${operationName}消息时出错 (尝试 ${retryCount + 1}/${CONSTANTS.RETRY.MAX_ATTEMPTS + 1}):`, error);
  
  if (shouldRetry(error.message, retryCount)) {
    scheduleRetry(() => {
      sendMessageWithRetry(tabId, message, operationName, retryCount + 1);
    }, retryCount);
  } else {
    console.error(`${operationName}请求最终失败`);
  }
}

/**
 * 处理响应失败
 * @param {Object} response - 响应对象
 * @param {number} tabId - 标签页ID
 * @param {Object} message - 原始消息
 * @param {string} operationName - 操作名称
 * @param {number} retryCount - 重试次数
 */
function handleResponseFailure(response, tabId, message, operationName, retryCount) {
  if (isScriptNotReady(response)) {
    console.log('内容脚本尚未完全就绪，进行重试');
    if (retryCount < CONSTANTS.RETRY.MAX_ATTEMPTS) {
      scheduleRetry(() => {
        sendMessageWithRetry(tabId, message, operationName, retryCount + 1);
      }, retryCount);
    } else {
      console.error(`内容脚本长时间未就绪，${operationName}请求失败`);
    }
  } else {
    console.error(`${operationName}执行失败:`, response.error || response.message);
  }
}

/**
 * 判断是否应该重试
 * @param {string} errorMessage - 错误消息
 * @param {number} retryCount - 当前重试次数
 * @returns {boolean} - 是否应该重试
 */
function shouldRetry(errorMessage, retryCount) {
  return retryCount < CONSTANTS.RETRY.MAX_ATTEMPTS && 
         CONSTANTS.ERROR_MESSAGES.CONNECTION_FAILED.some(msg => errorMessage.includes(msg));
}

/**
 * 检查响应是否为失败状态
 * @param {Object} response - 响应对象
 * @returns {boolean} - 是否为失败状态
 */
function isResponseFailure(response) {
  return response && response.success === false;
}

/**
 * 检查脚本是否未就绪
 * @param {Object} response - 响应对象
 * @returns {boolean} - 脚本是否未就绪
 */
function isScriptNotReady(response) {
  return response.message && 
         CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_READY.some(msg => response.message.includes(msg));
}

/**
 * 安排重试操作
 * @param {Function} retryFunction - 重试函数
 * @param {number} retryCount - 当前重试次数
 */
function scheduleRetry(retryFunction, retryCount) {
  console.log(`内容脚本可能尚未加载完成，${CONSTANTS.RETRY.DELAY_MS}ms后进行第${retryCount + 2}次尝试`);
  setTimeout(retryFunction, CONSTANTS.RETRY.DELAY_MS);
}

// ==================== 消息监听系统 ====================
/**
 * 设置消息监听器
 */
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('接收到消息:', request);
    
    const messageHandlers = {
      [CONSTANTS.ACTIONS.PERFORM_TRANSLATION]: () => handlePerformTranslation(request, sender, sendResponse),
      [CONSTANTS.ACTIONS.GET_CONFIG]: () => handleGetConfig(sendResponse)
    };

    const handler = messageHandlers[request.action];
    if (handler) {
      return handler();
    }
  });
}

/**
 * 处理执行翻译消息
 * @param {Object} request - 请求对象
 * @param {Object} sender - 发送者信息
 * @param {Function} sendResponse - 响应函数
 */
function handlePerformTranslation(request, sender, sendResponse) {
  const tabId = sender.tab?.id;
  console.log('消息请求翻译，文本:', request.text, '标签ID:', tabId);
  
  sendResponse({ status: 'translating' });
  performTranslation(request.text, tabId);
}

/**
 * 处理获取配置消息
 * @param {Function} sendResponse - 响应函数
 * @returns {boolean} - 是否异步响应
 */
function handleGetConfig(sendResponse) {
  console.log('收到获取配置请求');
  
  ConfigService.load()
    .then(config => {
      console.log('已加载配置并准备返回');
      sendResponse({ config });
    })
    .catch(error => {
      console.error('加载配置时出错:', error);
      sendResponse({ error: error.message });
    });
  
  return true; // 异步响应
}

// ==================== 翻译系统 ====================
/**
 * 向标签页发送消息
 * @param {number} tabId - 标签页ID
 * @param {string} action - 操作类型
 * @param {string} text - 原始文本
 * @param {string} result - 结果或错误信息
 * @param {boolean} isError - 是否为错误信息
 */
function sendMessageToTab(tabId, action, text, result, isError = false) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action, text, result, isError });
    console.log(`已发送${action}消息到标签页:`, tabId, isError ? '(错误)' : '');
  }
}

/**
 * 处理翻译过程中的错误
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文
 * @param {number} tabId - 标签页ID 
 * @param {string} text - 原始文本
 */
function handleTranslationError(error, context, tabId, text) {
  console.error(`${context}:`, error);
  if (tabId) {
    sendMessageToTab(tabId, CONSTANTS.ACTIONS.TRANSLATE, text, `${context}: ${error.message}`, true);
  }
}

/**
 * 获取模型信息
 * @param {Object} config - 配置对象
 * @returns {Object|null} - 模型信息或null（出错时）
 */
function getModelInfo(config) {
  if (config.currentModel === 'custom' && config.customModel?.enabled) {
    return config.customModel;
  }
  
  if (config.modelDefinitions?.[config.currentModel]) {
    return config.modelDefinitions[config.currentModel];
  }
  
  throw new Error(`未找到模型信息: ${config.currentModel || '未指定模型'}`);
}

/**
 * 获取API密钥
 * @param {string} modelType - 模型类型
 * @param {Object} config - 配置对象
 * @returns {string|null} - API密钥或null（未找到时）
 */
function getApiKey(modelType, config) {
  if (modelType === 'custom' && config.customModel?.apiKey) {
    return config.customModel.apiKey;
  }
  
  if (config.apiKeys?.[modelType]) {
    return config.apiKeys[modelType];
  }
  
  return null;
}

/**
 * 执行翻译操作
 * @param {string} text - 要翻译的文本
 * @param {number} tabId - 标签页ID
 */
async function performTranslation(text, tabId) {
  console.log('执行翻译操作，文本:', text, '标签ID:', tabId);
  
  if (!text?.trim()) {
    console.log('文本为空，取消翻译');
    return;
  }
  
  try {
    const config = await ConfigService.load();
    logConfigInfo(config, '翻译请求加载的');
    
    const modelInfo = getModelInfo(config);
    const modelType = modelInfo.type;
    const apiKey = getApiKey(modelType, config);
    
    if (!apiKey) {
      const errorMessage = `Please configure API key in extension settings first.\n\n请先在扩展设置中配置 ${modelType} 的API密钥。`;
      sendMessageToTab(tabId, CONSTANTS.ACTIONS.TRANSLATE, text, errorMessage, true);
      return;
    }
    
    console.log(`开始翻译，模型类型: ${modelType}, 模型名称: ${modelInfo.name}`);
    
    const translatedText = await TranslatorService.translate(text);
    console.log('翻译成功:', translatedText);
    sendMessageToTab(tabId, CONSTANTS.ACTIONS.TRANSLATE, text, translatedText, false);
    
  } catch (error) {
    handleTranslationError(error, '翻译过程中出错', tabId, text);
  }
} 