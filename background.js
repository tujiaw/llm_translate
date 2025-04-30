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
      console.log('已加载配置', { ...config, apiKey: '******' });
      
      // 如果是首次安装且没有设置过，确保默认值已设置
      if (!config.model) {
        console.log('首次安装，设置默认配置');
        ConfigService.reset();
      } else {
        console.log('已有配置，无需设置默认值');
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
    console.log('文本为空，取消翻译');
    return;
  }
  
  // 加载配置
  ConfigService.load().then(config => {
    
    // 验证API密钥
    if (!config.apiKey) {
      console.log('错误: API密钥未设置');
      // 如果没有API密钥，通知用户设置
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: "translate",
          text: text,
          result: "请先在插件设置中配置API密钥"
        });
      }
      return;
    }
    
    // 检测语言
    const isChineseQuery = /[\u4e00-\u9fa5]/.test(text);
    console.log('是否中文查询:', isChineseQuery);
    
    try {
      // 使用ApiService创建请求配置
      const { apiEndpoint, requestBody } = ApiService.createRequestConfig(
        config,
        text,
        isChineseQuery
      );
      
      console.log('API端点:', apiEndpoint);
      
      // 在发送API请求前添加验证
      if (!ApiService.validateApiEndpoint(apiEndpoint)) {
        console.error('无效的API端点，取消请求:', apiEndpoint);
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: "translate",
            text: text,
            result: `错误: 无效的API端点 "${apiEndpoint}"`
          });
        }
        return;
      }
      
      // 发送API请求
      fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody)
      })
      .then(response => {
        console.log('API响应状态:', response.status);
        if (!response.ok) {
          throw new Error(`API请求失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('API响应数据:', data);
        
        // 解析响应
        const translatedText = ApiService.parseApiResponse(data, config.model);
        console.log('解析后的翻译结果:', translatedText);
        
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
        console.error('翻译出错:', error);
        // 发送错误信息回内容脚本
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: "translate",
            text: text,
            result: `翻译出错: ${error.message}`
          });
          console.log('已发送错误信息到标签页:', tabId);
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