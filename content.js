// content.js - 内容脚本

// ==================== 常量定义 ====================
const CONSTANTS = {
  SCRIPT_READY_CHECK: {
    MAX_WAIT_TIME: 2000,
    CHECK_INTERVAL: 50
  },
  UI: {
    BUTTON_OFFSET_Y: 12,
    DEBOUNCE_DELAY: 100
  },
  ACTIONS: {
    GET_SELECTED_TEXT: 'getSelectedText',
    TRANSLATE: 'translate',
    SHOW_LOADING_POPUP: 'showLoadingPopup',
    TRANSLATE_WEBPAGE: 'translateWebpage',
    CLEAR_WEBPAGE_TRANSLATIONS: 'clearWebpageTranslations',
    PERFORM_TRANSLATION: 'performTranslation'
  },
  SELECTORS: {
    TRANSLATION_POPUP: '.llm-translation-popup',
    TRANSLATE_BUTTON: '.llm-translate-button'
  },
  ERRORS: {
    EXTENSION_CONTEXT_INVALIDATED: 'Extension context invalidated',
    SCRIPT_NOT_READY: 'Script not ready after waiting',
    UNKNOWN_ACTION: 'Unknown action'
  }
};

// ==================== 主应用类 ====================
class LLMTranslationContentScript {
  constructor() {
    this.scriptReady = false;
    this.selectedText = '';
    this.translationPopup = null;
    this.isExtensionActive = true;
    this.services = {};
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      console.log('开始加载LLM翻译内容脚本');
      
      await this.loadModules();
      this.setupEventListeners();
      this.markScriptReady();
      
      console.log('LLM翻译内容脚本已成功加载');
    } catch (error) {
      console.error('初始化内容脚本时出错:', error);
      throw error;
    }
  }

  /**
   * 加载所需模块
   */
  async loadModules() {
    const moduleNames = ['ui.js', 'messaging.js', 'utils.js', 'webpage_translator.js'];
    const getModuleUrl = (moduleName) => chrome.runtime.getURL(moduleName);
    
    try {
      const [uiModule, messagingModule, utilsModule, webpageTranslatorModule] = 
        await Promise.all(moduleNames.map(name => import(getModuleUrl(name))));
      
      this.services = {
        ui: uiModule.default,
        messaging: messagingModule.default,
        utils: utilsModule.default,
        webpageTranslator: webpageTranslatorModule.default
      };
    } catch (error) {
      console.error('导入模块时出错:', error);
      throw error;
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    this.setupMessageListeners();
    this.setupExtensionContextListeners();
    this.setupTextSelectionListener();
  }

  /**
   * 标记脚本已就绪
   */
  markScriptReady() {
    this.scriptReady = true;
    console.log('内容脚本已完全就绪');
  }

  /**
   * 设置消息监听器
   */
  setupMessageListeners() {
    this.services.messaging.registerMessageListener(async (request, sender) => {
      console.log('内容脚本收到消息:', request);
      
      await this.ensureScriptReady();
      return await this.handleMessage(request, sender);
    });
  }

  /**
   * 确保脚本已就绪
   */
  async ensureScriptReady() {
    if (this.scriptReady) return;

    console.warn('内容脚本尚未完全就绪，等待就绪...');
    
    const { MAX_WAIT_TIME, CHECK_INTERVAL } = CONSTANTS.SCRIPT_READY_CHECK;
    let waitedTime = 0;
    
    while (!this.scriptReady && waitedTime < MAX_WAIT_TIME) {
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
      waitedTime += CHECK_INTERVAL;
    }
    
    if (!this.scriptReady) {
      console.error('内容脚本长时间未就绪，消息处理失败');
      throw new Error(CONSTANTS.ERRORS.SCRIPT_NOT_READY);
    }
    
    console.log('内容脚本已就绪，继续处理消息');
  }

  /**
   * 处理接收到的消息
   */
  async handleMessage(request, sender) {
    try {
      const messageHandlers = {
        [CONSTANTS.ACTIONS.GET_SELECTED_TEXT]: () => this.handleGetSelectedText(),
        [CONSTANTS.ACTIONS.TRANSLATE]: () => this.handleTranslateMessage(request),
        [CONSTANTS.ACTIONS.SHOW_LOADING_POPUP]: () => this.handleShowLoadingPopup(),
        [CONSTANTS.ACTIONS.TRANSLATE_WEBPAGE]: () => this.handleTranslateWebpage(),
        [CONSTANTS.ACTIONS.CLEAR_WEBPAGE_TRANSLATIONS]: () => this.handleClearTranslations()
      };

      const handler = messageHandlers[request.action];
      if (handler) {
        return await handler();
      }
      
      return { success: false, error: CONSTANTS.ERRORS.UNKNOWN_ACTION };
    } catch (error) {
      console.error('处理消息时出错:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理获取选中文本消息
   */
  handleGetSelectedText() {
    console.log('发送选中文本:', this.selectedText);
    return { selectedText: this.selectedText };
  }

  /**
   * 处理翻译消息
   */
  handleTranslateMessage(request) {
    console.log('收到翻译结果:', request.result, '是否错误:', request.isError);
    this.handleTranslation(request.text, request.result, request.isError);
    return { success: true };
  }

  /**
   * 处理显示加载弹窗消息
   */
  handleShowLoadingPopup() {
    console.log('显示加载弹窗');
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 3;
    this.showLoadingPopup(x, y);
    return { success: true };
  }

  /**
   * 处理网页翻译消息
   */
  async handleTranslateWebpage() {
    console.log('接收到全网页翻译请求');
    try {
      await this.services.webpageTranslator.translateWebpage();
      console.log('全网页翻译已完成');
      return { success: true };
    } catch (error) {
      console.error('执行全网页翻译时出错:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理清除翻译消息
   */
  handleClearTranslations() {
    console.log('接收到清除翻译请求');
    try {
      this.services.webpageTranslator.clearTranslations();
      console.log('清除翻译已完成');
      return { success: true };
    } catch (error) {
      console.error('清除翻译时出错:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 设置扩展上下文监听器
   */
  setupExtensionContextListeners() {
    this.services.messaging.setupExtensionContextListeners();
    this.setupExtensionInvalidationHandlers();
  }

  /**
   * 设置扩展失效处理器
   */
  setupExtensionInvalidationHandlers() {
    // 监听扩展上下文失效错误
    try {
      chrome.runtime.onMessageExternal.addListener(() => {});
    } catch (error) {
      if (error.message.includes(CONSTANTS.ERRORS.EXTENSION_CONTEXT_INVALIDATED)) {
        this.handleExtensionInvalidation();
      }
    }

    // 断开连接时的处理
    chrome.runtime.onConnect.addListener((port) => {
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError?.message.includes(CONSTANTS.ERRORS.EXTENSION_CONTEXT_INVALIDATED)) {
          this.handleExtensionInvalidation();
        }
      });
    });
  }

  /**
   * 设置文本选择监听
   */
  setupTextSelectionListener() {
    const debouncedHandler = this.services.utils.debounce(
      (event) => this.handleMouseUp(event), 
      CONSTANTS.UI.DEBOUNCE_DELAY
    );
    
    document.addEventListener('mouseup', debouncedHandler);
  }

  /**
   * 处理鼠标抬起事件
   */
  handleMouseUp(event) {
    if (this.isEventFromTranslationUI(event)) {
      return;
    }
    
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText) {
      this.handleTextSelection(event);
    } else {
      this.cleanupUI();
    }
  }

  /**
   * 检查事件是否来自翻译UI
   */
  isEventFromTranslationUI(event) {
    return event.target.closest(CONSTANTS.SELECTORS.TRANSLATION_POPUP) ||
           event.target.closest(CONSTANTS.SELECTORS.TRANSLATE_BUTTON);
  }

  /**
   * 清理UI元素
   */
  cleanupUI() {
    this.services.ui.safeRemoveTranslateButton();
    this.removeTranslationPopup();
  }

  /**
   * 移除翻译弹窗
   */
  removeTranslationPopup() {
    if (this.translationPopup && document.body.contains(this.translationPopup)) {
      document.body.removeChild(this.translationPopup);
      this.translationPopup = null;
    }
  }

  /**
   * 处理文本选择事件
   */
  handleTextSelection(event) {
    this.selectedText = window.getSelection().toString().trim();
    
    if (this.selectedText) {
      console.log('Selected text:', this.selectedText);
    }
    
    this.removeTranslationPopup();
    
    if (this.selectedText.length > 0) {
      const position = this.calculateButtonPosition(event);
      console.log('Creating translation button at position:', position.x, position.y);
      this.createTranslateButton(position.x, position.y, this.selectedText);
    }
  }

  /**
   * 计算按钮位置
   */
  calculateButtonPosition(event) {
    const x = event.pageX || event.clientX + window.scrollX;
    const y = (event.pageY || event.clientY + window.scrollY) + CONSTANTS.UI.BUTTON_OFFSET_Y;
    return { x, y };
  }

  /**
   * 创建翻译按钮
   */
  createTranslateButton(x, y, textToTranslate) {
    const onTranslateClick = (text, btnX, btnY) => {
      this.showLoadingPopup(btnX, btnY);
      this.sendTranslationRequest(text).catch(error => {
        if (this.translationPopup && document.body.contains(this.translationPopup)) {
          this.services.ui.showError(this.translationPopup, text, error.message);
        }
      });
    };
    
    this.services.ui.createTranslateButton(x, y, textToTranslate, onTranslateClick);
  }

  /**
   * 显示加载中的弹窗
   */
  showLoadingPopup(x, y) {
    console.log('Showing loading popup at position:', x, y);
    this.translationPopup = this.services.ui.createLoadingPopup(x, y);
  }

  /**
   * 发送翻译请求到后台脚本
   */
  async sendTranslationRequest(text) {
    try {
      this.safeSendMessage({
        action: CONSTANTS.ACTIONS.PERFORM_TRANSLATION,
        text: text
      });
    } catch (error) {
      console.error('Error sending translation request:', error);
      throw error;
    }
  }

  /**
   * 处理翻译结果
   */
  handleTranslation(originalText, translatedText, isError = false) {
    const safeOriginalText = (originalText || '').trim();
    const safeTranslatedText = (translatedText || '').trim();
    
    console.log('Processing translation result, original:', this.services.utils.truncateText(safeOriginalText, 50));
    console.log('Translation result:', this.services.utils.truncateText(safeTranslatedText, 50), 'isError:', isError);
    
    if (this.translationPopup && document.body.contains(this.translationPopup)) {
      if (isError) {
        this.services.ui.showError(this.translationPopup, safeOriginalText, safeTranslatedText);
      } else {
        this.services.ui.updatePopupWithTranslation(this.translationPopup, safeOriginalText, safeTranslatedText);
      }
    } else {
      console.warn('Translation popup does not exist or has been removed, cannot update content');
    }
  }

  /**
   * 处理扩展上下文失效
   */
  handleExtensionInvalidation() {
    this.isExtensionActive = false;
    console.warn('Extension context invalidated, some features may not work properly');
  }

  /**
   * 安全发送消息函数
   */
  safeSendMessage(message, callback) {
    if (!this.isExtensionActive) {
      console.warn('扩展上下文已失效，无法发送消息');
      this.executeCallback(callback, { error: CONSTANTS.ERRORS.EXTENSION_CONTEXT_INVALIDATED });
      return;
    }
    
    try {
      chrome.runtime.sendMessage(message, (response) => {
        this.handleMessageResponse(response, callback);
      });
    } catch (error) {
      console.error('发送消息时发生异常:', error);
      this.handleMessageError(error, callback);
    }
  }

  /**
   * 处理消息响应
   */
  handleMessageResponse(response, callback) {
    if (chrome.runtime.lastError) {
      console.error('发送消息时出错:', chrome.runtime.lastError);
      this.handleRuntimeError(chrome.runtime.lastError, callback);
    } else {
      this.executeCallback(callback, response);
    }
  }

  /**
   * 处理运行时错误
   */
  handleRuntimeError(error, callback) {
    if (error.message.includes(CONSTANTS.ERRORS.EXTENSION_CONTEXT_INVALIDATED)) {
      this.handleExtensionInvalidation();
    }
    this.executeCallback(callback, { error: error.message });
  }

  /**
   * 处理消息错误
   */
  handleMessageError(error, callback) {
    if (error.message.includes(CONSTANTS.ERRORS.EXTENSION_CONTEXT_INVALIDATED)) {
      this.handleExtensionInvalidation();
    }
    this.executeCallback(callback, { error: error.message });
  }

  /**
   * 安全执行回调函数
   */
  executeCallback(callback, data) {
    if (callback) {
      try {
        callback(data);
      } catch (callbackError) {
        console.error('执行回调时出错:', callbackError);
      }
    }
  }
}

// ==================== 应用启动 ====================
(async function initializeApp() {
  try {
    const app = new LLMTranslationContentScript();
    await app.initialize();
  } catch (error) {
    console.error('启动LLM翻译内容脚本失败:', error);
  }
})(); 