// content.js - 内容脚本
// 使用动态导入获取模块
(async function() {
  try {
    console.log('开始加载LLM翻译内容脚本');
    
    // 构建完整的模块URL
    const getModuleUrl = (moduleName) => {
      return chrome.runtime.getURL(moduleName);
    };
    
    // 动态导入模块
    const [uiModule, messagingModule, utilsModule] = await Promise.all([
      import(getModuleUrl('ui.js')),
      import(getModuleUrl('messaging.js')),
      import(getModuleUrl('utils.js'))
    ]).catch(error => {
      console.error('导入模块时出错:', error);
      throw error;
    });
    
    const UiService = uiModule.default;
    const MessagingService = messagingModule.default;
    const Utils = utilsModule.default;
    
    // 全局变量
    let selectedText = '';
    let translationPopup = null;
    let isExtensionActive = true;
    
    console.log('LLM翻译内容脚本已成功加载');
    
    // 初始化
    // 设置消息监听
    setupMessageListeners();
    
    // 设置扩展上下文监听器
    MessagingService.setupExtensionContextListeners();
    
    // 设置文本选择监听器
    setupTextSelectionListener();
    
    /**
     * 设置消息监听器
     */
    function setupMessageListeners() {
      MessagingService.registerMessageListener((request, sender) => {
        console.log('内容脚本收到消息:', request);
        
        if (request.action === "getSelectedText") {
          console.log('发送选中文本:', selectedText);
          return { selectedText: selectedText };
        } else if (request.action === "translate") {
          console.log('收到翻译结果:', request.result);
          handleTranslation(request.text, request.result);
        } else if (request.action === "showLoadingPopup") {
          console.log('显示加载弹窗');
          // 获取当前鼠标位置
          const x = window.innerWidth / 2;
          const y = window.innerHeight / 3;
          showLoadingPopup(x, y);
        }
      });
    }
    
    /**
     * 设置文本选择监听
     */
    function setupTextSelectionListener() {
      // 使用节流函数优化事件处理
      const throttledMouseUpHandler = Utils.throttle(handleTextSelection, 300);
      document.addEventListener('mouseup', throttledMouseUpHandler);
      
      // 额外添加双击事件监听
      document.addEventListener('dblclick', function(event) {
        // 延迟一点执行，确保选中文本已经完成
        setTimeout(() => {
          handleTextSelection(event);
        }, 50);
      });
    }
    
    /**
     * 处理文本选择事件
     * @param {MouseEvent} event - 鼠标事件
     */
    function handleTextSelection(event) {
      // 获取当前选中的文本
      selectedText = window.getSelection().toString().trim();
      
      if (selectedText) {
        console.log('选中文本:', selectedText);
      }
      
      // 检查是否存在翻译弹窗，如果有则移除
      if (translationPopup) {
        if (document.body.contains(translationPopup)) {
          document.body.removeChild(translationPopup);
        }
        translationPopup = null;
      }
      
      // 如果有选中的文本，创建快速翻译按钮
      if (selectedText.length > 0) {
        const x = event.pageX || event.clientX + window.scrollX;
        const y = event.pageY || event.clientY + window.scrollY;
        console.log('创建翻译按钮，位置:', x, y);
        createTranslateButton(x, y, selectedText);
      }
    }
    
    /**
     * 创建翻译按钮
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {string} textToTranslate - 要翻译的文本
     */
    function createTranslateButton(x, y, textToTranslate) {
      const onTranslateClick = (text, btnX, btnY) => {
        showLoadingPopup(btnX, btnY);
        
        // 通知后台脚本进行翻译
        console.log('发送翻译请求到后台脚本, 文本:', text);
        sendTranslationRequest(text).catch(error => {
          if (translationPopup && document.body.contains(translationPopup)) {
            UiService.showError(translationPopup, text, error.message);
          }
        });
      };
      
      // 使用UI服务创建按钮
      UiService.createTranslateButton(x, y, textToTranslate, onTranslateClick);
    }
    
    /**
     * 显示加载中的弹窗
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     */
    function showLoadingPopup(x, y) {
      console.log('显示加载中弹窗，位置:', x, y);
      translationPopup = UiService.createLoadingPopup(x, y);
    }
    
    /**
     * 发送翻译请求到后台脚本
     * @param {string} text - 要翻译的文本
     * @returns {Promise<void>}
     */
    async function sendTranslationRequest(text) {
      try {
        await MessagingService.sendMessage({
          action: "performTranslation",
          text: text
        });
      } catch (error) {
        console.error('发送翻译请求时出错:', error);
        throw error;
      }
    }
    
    /**
     * 处理翻译结果
     * @param {string} originalText - 原文本
     * @param {string} translatedText - 翻译结果
     */
    function handleTranslation(originalText, translatedText) {
      // 确保参数有效，避免后续操作失败
      originalText = originalText || '';
      translatedText = translatedText || '';
      
      console.log('处理翻译结果, 原文:', Utils.truncateText(originalText, 50));
      console.log('翻译结果:', Utils.truncateText(translatedText, 50));
      
      // 使用UI服务更新弹窗内容
      if (translationPopup && document.body.contains(translationPopup)) {
        UiService.updatePopupWithTranslation(translationPopup, originalText, translatedText);
      } else {
        console.warn('翻译弹窗不存在或已被移除，无法更新内容');
      }
    }
    
    /**
     * 处理扩展上下文失效
     */
    function handleExtensionInvalidation() {
      isExtensionActive = false;
      console.warn('扩展上下文已失效，某些功能可能无法正常工作');
    }
    
    // 监听扩展上下文失效错误
    try {
      chrome.runtime.onMessageExternal.addListener(function() {});
    } catch (error) {
      if (error.message.includes('Extension context invalidated')) {
        handleExtensionInvalidation();
      }
    }
    
    // 断开连接时的处理
    chrome.runtime.onConnect.addListener(function(port) {
      port.onDisconnect.addListener(function() {
        if (chrome.runtime.lastError) {
          console.warn('连接断开:', chrome.runtime.lastError);
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            handleExtensionInvalidation();
          }
        }
      });
    });
    
    // 安全发送消息函数
    function safeSendMessage(message, callback) {
      if (!isExtensionActive) {
        console.warn('扩展上下文已失效，无法发送消息');
        if (callback) {
          try {
            callback({error: 'Extension context invalidated'});
          } catch (callbackError) {
            console.error('执行回调时出错:', callbackError);
          }
        }
        return;
      }
      
      try {
        chrome.runtime.sendMessage(message, function(response) {
          if (chrome.runtime.lastError) {
            console.error('发送消息时出错:', chrome.runtime.lastError);
            if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
              handleExtensionInvalidation();
            }
            if (callback) {
              try {
                callback({error: chrome.runtime.lastError.message});
              } catch (callbackError) {
                console.error('错误回调执行失败:', callbackError);
              }
            }
          } else {
            if (callback) {
              try {
                callback(response);
              } catch (callbackError) {
                console.error('成功回调执行失败:', callbackError);
              }
            }
          }
        });
      } catch (error) {
        console.error('发送消息时发生异常:', error);
        if (error.message.includes('Extension context invalidated')) {
          handleExtensionInvalidation();
        }
        if (callback) {
          try {
            callback({error: error.message});
          } catch (callbackError) {
            console.error('异常回调执行失败:', callbackError);
          }
        }
      }
    }
  } catch (error) {
    console.error('加载模块时出错:', error);
  }
})(); 