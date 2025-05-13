// background.js - 后台脚本

// 使用静态导入
import ConfigService from './config.js';
import ApiService from './api.js';
import TranslatorService from './translator.js';
import Utils from './utils.js';

console.log('LLM翻译扩展后台脚本已加载');

// 初始化配置
initializeConfig();

// 设置消息监听
setupMessageListeners();

/**
 * 记录配置信息的通用函数
 * @param {Object} config - 配置对象
 * @param {string} prefix - 日志前缀
 */
function logConfigInfo(config, prefix = '') {
  console.log(`${prefix}配置信息:`, JSON.stringify({
    currentModel: config.currentModel,
    hasModelDefinitions: Boolean(config.modelDefinitions),
    modelDefinitionsCount: config.modelDefinitions ? Object.keys(config.modelDefinitions).length : 0,
    hasApiKeys: Boolean(config.apiKeys),
    apiKeysSiliconFlow: Boolean(config.apiKeys && config.apiKeys['silicon-flow']),
    apiKeysZhipu: Boolean(config.apiKeys && config.apiKeys['zhipu']),
    customModelEnabled: Boolean(config.customModel && config.customModel.enabled)
  }));
}

/**
 * 向标签页发送消息的通用函数
 * @param {number} tabId - 标签页ID
 * @param {string} action - 操作类型
 * @param {string} text - 原始文本
 * @param {string} result - 结果或错误信息
 * @param {boolean} isError - 是否为错误信息
 */
function sendMessageToTab(tabId, action, text, result, isError = false) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { 
      action, 
      text, 
      result,
      isError // 添加错误状态标识
    });
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
    sendMessageToTab(tabId, "translate", text, `${context}: ${error.message}`, true);
  }
}

/**
 * 初始化配置
 */
function initializeConfig() {
  try {
    // 获取当前配置
    ConfigService.load().then(config => {
      logConfigInfo(config, '已加载');
      
      // 检查配置完整性
      if (!config.modelDefinitions || Object.keys(config.modelDefinitions).length === 0) {
        console.log('配置不完整，重置为默认值');
        ConfigService.reset();
      } else {
        console.log('已有完整配置，无需设置默认值');
      }
    });
  } catch (error) {
    console.error('初始化配置时出错:', error);
  }
}

/**
 * 设置消息监听器
 */
function setupMessageListeners() {
  // 监听来自弹出窗口或内容脚本的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('接收到消息:', request);
    
    if (request.action === "performTranslation") {
      const tabId = sender.tab ? sender.tab.id : null;
      console.log('消息请求翻译，文本:', request.text, '标签ID:', tabId);
      
      // 立即返回确认消息，避免等待异步操作
      sendResponse({ status: 'translating' });
      
      // 异步执行翻译，不影响消息响应
      performTranslation(request.text, tabId);
    } else if (request.action === "getConfig") {
      // 处理获取配置的请求
      console.log('收到获取配置请求');
      
      // 由于ConfigService.load是异步的，需要特殊处理
      ConfigService.load().then(config => {
        console.log('已加载配置并准备返回');
        sendResponse({ config: config });
      }).catch(error => {
        console.error('加载配置时出错:', error);
        sendResponse({ error: error.message });
      });
      
      // 返回true表示将使用异步响应
      return true;
    }
    
    // 不需要返回true，因为已经同步响应
  });
}

/**
 * 获取模型信息
 * @param {Object} config - 配置对象
 * @param {string} text - 要翻译的文本
 * @param {number} tabId - 标签页ID
 * @returns {Object|null} - 模型信息或null（出错时）
 */
function getModelInfo(config, text, tabId) {
  try {
    if (config.currentModel === 'custom' && config.customModel && config.customModel.enabled) {
      return config.customModel;
    } else if (config.modelDefinitions && config.modelDefinitions[config.currentModel]) {
      return config.modelDefinitions[config.currentModel];
    } else {
      throw new Error(`未找到模型信息: ${config.currentModel || '未指定模型'}`);
    }
  } catch (error) {
    handleTranslationError(error, '获取模型信息时出错', tabId, text);
    return null;
  }
}

/**
 * 获取API密钥
 * @param {string} modelType - 模型类型
 * @param {Object} config - 配置对象
 * @param {string} text - 要翻译的文本
 * @param {number} tabId - 标签页ID
 * @returns {string|null} - API密钥或null（未找到时）
 */
function getApiKey(modelType, config, text, tabId) {
  let apiKey;
  
  if (modelType === 'custom' && config.customModel && config.customModel.apiKey) {
    apiKey = config.customModel.apiKey;
  } else if (config.apiKeys && config.apiKeys[modelType]) {
    apiKey = config.apiKeys[modelType];
  }
  
  if (!apiKey) {
    console.log(`错误: ${modelType} 的API密钥未设置`);
    sendMessageToTab(tabId, "translate", text, 
      `Please configure API key in extension settings first.\n\n请先在扩展设置中配置 ${modelType} 的API密钥。`, true);
    return null;
  }
  
  return apiKey;
}

/**
 * 执行翻译操作
 * @param {string} text - 要翻译的文本
 * @param {number} tabId - 标签页ID
 */
function performTranslation(text, tabId) {
  console.log('执行翻译操作，文本:', text, '标签ID:', tabId);
  
  if (!text || text.trim() === '') {
    console.log('文本为空，取消翻译');
    return;
  }
  
  // 加载配置
  ConfigService.load().then(config => {
    logConfigInfo(config, '翻译请求加载的');
    
    // 获取当前模型信息
    const modelInfo = getModelInfo(config, text, tabId);
    if (!modelInfo) return;
    
    // 检查API密钥
    const modelType = modelInfo.type;
    const apiKey = getApiKey(modelType, config, text, tabId);
    if (!apiKey) return;
    
    // 使用翻译服务
    try {
      console.log(`开始翻译，模型类型: ${modelType}, 模型名称: ${modelInfo.name}`);
      
      // 使用TranslatorService进行翻译
      TranslatorService.translate(text)
        .then(translatedText => {
          console.log('翻译成功:', translatedText);
          sendMessageToTab(tabId, "translate", text, translatedText, false);
        })
        .catch(error => {
          handleTranslationError(error, '翻译过程中出错', tabId, text);
        });
    } catch (error) {
      handleTranslationError(error, '准备翻译请求时出错', tabId, text);
    }
  }).catch(error => {
    handleTranslationError(error, '加载配置时出错', tabId, text);
  });
} 