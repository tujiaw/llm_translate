// background.js - 后台脚本

// 使用ES模块导入替代importScripts
import ConfigService from './config.js';
import ApiService from './api.js';
import MessagingService from './messaging.js';
import TranslatorService from './translator.js';

console.log('LLM翻译扩展后台脚本已加载');

// 创建右键菜单
setupContextMenu();

// 初始化配置
initializeConfig();

// 设置消息监听
setupMessageListeners();

/**
 * 设置右键菜单
 */
function setupContextMenu() {
  // 在插件安装或更新时执行
  chrome.runtime.onInstalled.addListener(() => {
    console.log('插件已安装或更新');
    
    // 创建右键菜单
    chrome.contextMenus.create({
      id: "translateSelection",
      title: "翻译选中文本",
      contexts: ["selection"]
    });
    console.log('已创建右键菜单');
  });
  
  // 监听右键菜单点击
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "translateSelection") {
      const selectedText = info.selectionText;
      console.log('右键菜单触发翻译，选中文本:', selectedText);
      
      // 发送消息到内容脚本，显示加载中的弹窗
      chrome.tabs.sendMessage(tab.id, {
        action: "showLoadingPopup"
      });
      
      // 执行翻译
      performTranslation(selectedText, tab.id);
    }
  });
}

/**
 * 初始化配置
 */
function initializeConfig() {
  try {
    // 获取当前配置
    ConfigService.load().then(config => {
      console.log('已加载配置', JSON.stringify({
        currentModel: config.currentModel,
        hasModelDefinitions: Boolean(config.modelDefinitions),
        modelDefinitionsCount: config.modelDefinitions ? Object.keys(config.modelDefinitions).length : 0,
        hasApiKeys: Boolean(config.apiKeys),
        apiKeysSiliconFlow: Boolean(config.apiKeys && config.apiKeys['silicon-flow']),
        apiKeysZhipu: Boolean(config.apiKeys && config.apiKeys['zhipu']),
        customModelEnabled: Boolean(config.customModel && config.customModel.enabled)
      }));
      
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
      performTranslation(request.text, tabId);
    }
    
    return true; // 保持消息通道开放
  });
}

/**
 * 执行翻译操作
 * @param {string} text - 要翻译的文本
 * @param {number} tabId - 标签页ID
 */
function performTranslation(text, tabId) {
  console.log('执行翻译操作，文本:', text, '标签ID:', tabId);
  
  if (!text || text.trim() === '') {
    console.log('Text is empty, translation cancelled');
    return;
  }
  
  // 加载配置
  ConfigService.load().then(config => {
    console.log('翻译请求加载的配置:', JSON.stringify({
      currentModel: config.currentModel,
      hasModelDefinitions: Boolean(config.modelDefinitions),
      modelDefinitionsCount: config.modelDefinitions ? Object.keys(config.modelDefinitions).length : 0,
      hasApiKeys: Boolean(config.apiKeys),
      apiKeysSiliconFlow: Boolean(config.apiKeys && config.apiKeys['silicon-flow']),
      apiKeysZhipu: Boolean(config.apiKeys && config.apiKeys['zhipu']),
      customModelEnabled: Boolean(config.customModel && config.customModel.enabled)
    }));
    
    // 获取当前模型信息
    let modelInfo;
    try {
      if (config.currentModel === 'custom' && config.customModel && config.customModel.enabled) {
        modelInfo = config.customModel;
      } else if (config.modelDefinitions && config.modelDefinitions[config.currentModel]) {
        modelInfo = config.modelDefinitions[config.currentModel];
      } else {
        throw new Error(`未找到模型信息: ${config.currentModel || '未指定模型'}`);
      }
    } catch (error) {
      console.error('获取模型信息时出错:', error);
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: "translate",
          text: text,
          result: `获取模型信息出错: ${error.message}`
        });
      }
      return;
    }
    
    // 检查API密钥
    const modelType = modelInfo.type;
    let apiKey;
    
    if (modelType === 'custom' && config.customModel && config.customModel.apiKey) {
      apiKey = config.customModel.apiKey;
    } else if (config.apiKeys && config.apiKeys[modelType]) {
      apiKey = config.apiKeys[modelType];
    }
    
    // 校验API密钥
    if (!apiKey) {
      console.log(`错误: ${modelType} 的API密钥未设置`);
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: "translate",
          text: text,
          result: `Please configure API key in extension settings first.\n\n请先在扩展设置中配置 ${modelType} 的API密钥。`
        });
      }
      return;
    }
    
    // 使用翻译服务
    try {
      console.log(`开始翻译，模型类型: ${modelType}, 模型名称: ${modelInfo.name}`);
      
      // 使用TranslatorService进行翻译
      TranslatorService.translate(text)
        .then(translatedText => {
          console.log('翻译成功:', translatedText);
          // 将翻译结果发送回内容脚本
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              action: "translate",
              text: text,
              result: translatedText
            });
            console.log('已发送翻译结果到标签页:', tabId);
          }
        })
        .catch(error => {
          console.error('翻译过程中出错:', error);
          // 发送错误信息回内容脚本
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              action: "translate",
              text: text,
              result: `翻译出错: ${error.message}`
            });
          }
        });
    } catch (error) {
      console.error('准备翻译请求时出错:', error);
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: "translate",
          text: text,
          result: `准备翻译请求时出错: ${error.message}`
        });
      }
    }
  }).catch(error => {
    console.error('加载配置时出错:', error);
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: "translate",
        text: text,
        result: `加载配置时出错: ${error.message}`
      });
    }
  });
} 