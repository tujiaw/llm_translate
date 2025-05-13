// popup.js - Popup window script
// Use dynamic imports to get modules
document.addEventListener('DOMContentLoaded', async function() {
  try {
    const [configModule, uiModule, utilsModule, apiModule] = await Promise.all([
      import(chrome.runtime.getURL('config.js')),
      import(chrome.runtime.getURL('ui.js')),
      import(chrome.runtime.getURL('utils.js')),
      import(chrome.runtime.getURL('api.js'))
    ]);
    
    const ConfigService = configModule.default;
    const UiService = uiModule.default;
    const Utils = utilsModule.default;
    const ApiService = apiModule.default;
    
    console.log('Initializing popup window');
    
    // Get DOM elements
    const elements = getDomElements();
    
    // Load settings from storage
    await loadSettings(elements);
    
    // Set up event listeners
    setupEventListeners(elements);
    
    // Check if there is selected text passed over
    await checkForSelectedText(elements);
    
    /**
     * Get DOM elements
     * @returns {object} DOM elements object
     */
    function getDomElements() {
      return {
        inputText: document.getElementById('inputText'),
        outputText: document.getElementById('outputText'),
        translateBtn: document.getElementById('translateBtn'),
        translateWebpageBtn: document.getElementById('translateWebpageBtn'),
        clearTranslationsBtn: document.getElementById('clearTranslationsBtn'),
        modelSelect: document.getElementById('modelSelect'),
        customModelConfig: document.getElementById('customModelConfig'),
        customModelName: document.getElementById('customModelName'),
        customModelEndpoint: document.getElementById('customModelEndpoint'),
        siliconFlowApiKey: document.getElementById('siliconFlowApiKey'),
        zhipuApiKey: document.getElementById('zhipuApiKey'),
        customApiKey: document.getElementById('customApiKey'),
        nativeLanguage: document.getElementById('nativeLanguage'),
        showSiliconFlowKeyBtn: document.getElementById('showSiliconFlowKeyBtn'),
        showZhipuKeyBtn: document.getElementById('showZhipuKeyBtn'),
        showCustomKeyBtn: document.getElementById('showCustomKeyBtn'),
        loadingSpinner: document.getElementById('loadingSpinner'),
        apiKeyLinks: document.querySelectorAll('.api-key a')
      };
    }
    
    /**
     * Load configuration settings
     * @param {object} elements - DOM elements object
     */
    async function loadSettings(elements) {
      try {
        console.log('Loading settings...');
        const config = await ConfigService.load();
        
        // 确保apiKeys对象存在
        if (!config.apiKeys) {
          config.apiKeys = {
            'silicon-flow': '',
            'zhipu': ''
          };
        }
        
        console.log('Settings loaded:', JSON.stringify({
          ...config,
          apiKeys: {
            'silicon-flow': config.apiKeys['silicon-flow'] ? '******' : '',
            'zhipu': config.apiKeys['zhipu'] ? '******' : '',
          }
        }));
        
        // 首先填充母语选择下拉框，提高用户体验
        populateLanguageSelect(elements.nativeLanguage);
        
        // 设置当前选择的母语
        if (config.nativeLanguage) {
          elements.nativeLanguage.value = config.nativeLanguage;
        }
        
        // 设置当前选择的模型
        elements.modelSelect.value = config.currentModel || 'glm-4-9b';
        
        // 设置API密钥
        elements.siliconFlowApiKey.value = config.apiKeys['silicon-flow'] || '';
        elements.zhipuApiKey.value = config.apiKeys['zhipu'] || '';
        elements.customApiKey.value = config.customModel && config.customModel.apiKey ? config.customModel.apiKey : '';
        
        // 显示/隐藏自定义模型配置
        if (config.currentModel === 'custom') {
          elements.customModelConfig.classList.remove('hidden');
          elements.customModelName.value = config.customModel && config.customModel.name ? config.customModel.name : '';
          elements.customModelEndpoint.value = config.customModel && config.customModel.apiEndpoint ? config.customModel.apiEndpoint : '';
        } else {
          elements.customModelConfig.classList.add('hidden');
        }
        
        // 根据当前选择的模型类型更新UI
        updateUiForSelectedModel(elements, config.currentModel);
      } catch (error) {
        console.error('Error loading settings:', error);
        UiService.showNotification('Error loading settings: ' + error.message, 'error');
      }
    }
    
    /**
     * 填充语言选择下拉框
     * @param {HTMLSelectElement} selectElement - 选择框元素
     */
    function populateLanguageSelect(selectElement) {
      // 清空现有选项
      selectElement.innerHTML = '';
      
      // 获取支持的语言列表(英文名称)
      const languages = Utils.getSupportedLanguagesInEnglish();
      
      // 添加选项
      languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        selectElement.appendChild(option);
      });
    }
    
    /**
     * Set up event listeners
     * @param {object} elements - DOM elements object
     */
    function setupEventListeners(elements) {
      // Translate button click event
      elements.translateBtn.addEventListener('click', () => translateText(elements));
      
      // 全网页翻译按钮点击事件
      elements.translateWebpageBtn.addEventListener('click', () => translateWebpage(elements));
      
      // 清除翻译按钮点击事件
      elements.clearTranslationsBtn.addEventListener('click', () => clearWebpageTranslations(elements));
      
      // Show/hide API key buttons
      elements.showSiliconFlowKeyBtn.addEventListener('click', () => toggleApiKeyVisibility(elements.siliconFlowApiKey, elements.showSiliconFlowKeyBtn));
      elements.showZhipuKeyBtn.addEventListener('click', () => toggleApiKeyVisibility(elements.zhipuApiKey, elements.showZhipuKeyBtn));
      elements.showCustomKeyBtn.addEventListener('click', () => toggleApiKeyVisibility(elements.customApiKey, elements.showCustomKeyBtn));
      
      // Text input change event, used to enable/disable translate button
      elements.inputText.addEventListener('input', () => {
        const text = elements.inputText.value.trim();
        elements.translateBtn.disabled = !text;
      });
      
      // 母语选择变化时更新目标语言显示
      elements.nativeLanguage.addEventListener('change', () => {
        // 添加高亮动画效果
        elements.nativeLanguage.classList.add('highlight-selection');
        setTimeout(() => {
          elements.nativeLanguage.classList.remove('highlight-selection');
        }, 1000);
        
        // 自动保存设置
        saveSettings(elements);
      });
      
      // Model select change event
      elements.modelSelect.addEventListener('change', () => {
        const selectedModel = elements.modelSelect.value;
        updateUiForSelectedModel(elements, selectedModel);
        
        // 自动保存设置
        saveSettings(elements);
      });
      
      // 为API密钥输入框添加change和blur事件以自动保存
      elements.siliconFlowApiKey.addEventListener('blur', () => saveSettings(elements));
      elements.zhipuApiKey.addEventListener('blur', () => saveSettings(elements));
      elements.customApiKey.addEventListener('blur', () => saveSettings(elements));
      elements.customModelName.addEventListener('blur', () => saveSettings(elements));
      elements.customModelEndpoint.addEventListener('blur', () => saveSettings(elements));
      
      // 为API密钥链接添加点击事件
      elements.apiKeyLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          // 在新标签页中打开链接
          chrome.tabs.create({ url: link.href });
        });
      });
    }
    
    /**
     * 根据选择的模型更新UI
     * @param {object} elements - DOM元素对象
     * @param {string} selectedModel - 选择的模型ID
     */
    function updateUiForSelectedModel(elements, selectedModel) {
      // 获取模型提供商类型
      let modelType;
      
      if (selectedModel === 'custom') {
        // 处理自定义模型
        elements.customModelConfig.classList.remove('hidden');
        modelType = 'custom';
      } else {
        // 隐藏自定义模型配置
        elements.customModelConfig.classList.add('hidden');
        
        // 根据选择的模型获取模型类型
        if (selectedModel.startsWith('glm-4-flash')) {
          modelType = 'zhipu';
        } else if (selectedModel.startsWith('glm-4') || selectedModel.startsWith('qwen')) {
          modelType = 'silicon-flow';
        }
      }
      
      // 显示/隐藏对应的API密钥输入框
      const apiKeySections = document.querySelectorAll('.api-key');
      apiKeySections.forEach(section => {
        section.classList.add('hidden');
      });
      
      // 显示对应类型的API密钥输入框
      if (modelType) {
        const targetSection = document.querySelector(`.api-key.${modelType}`);
        if (targetSection) {
          targetSection.classList.remove('hidden');
        }
      }
    }
    
    /**
     * Check if there is selected text to be passed over
     * @param {object} elements - DOM elements object
     */
    async function checkForSelectedText(elements) {
      try {
        // Query current active tab
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        
        // Send message to get selected text
        chrome.tabs.sendMessage(tabs[0].id, {action: "getSelectedText"}, function(response) {
          if (response && response.selectedText) {
            elements.inputText.value = response.selectedText;
            elements.translateBtn.disabled = false;
          }
        });
      } catch (error) {
        console.error('Error getting selected text:', error);
      }
    }
    
    /**
     * Translate text
     * @param {object} elements - DOM elements object
     */
    async function translateText(elements) {
      console.log('Starting translation...');
      const text = elements.inputText.value.trim();
      
      if (!text) {
        console.log('No input text, translation cancelled');
        return;
      }
      
      try {
        // Show loading state
        elements.loadingSpinner.classList.add('visible');
        elements.translateBtn.disabled = true;
        
        // Load configuration
        const config = await ConfigService.load();
        
        console.log('翻译时加载的配置:', JSON.stringify({
          currentModel: config.currentModel,
          hasModelDefinitions: Boolean(config.modelDefinitions),
          hasApiKeys: Boolean(config.apiKeys),
          apiKeysSiliconFlow: Boolean(config.apiKeys && config.apiKeys['silicon-flow']),
          apiKeysZhipu: Boolean(config.apiKeys && config.apiKeys['zhipu']),
          customModelEnabled: Boolean(config.customModel && config.customModel.enabled)
        }));
        
        // 检查配置是否完整
        if (!config.modelDefinitions) {
          console.error('配置中缺少modelDefinitions');
          elements.outputText.value = '配置错误: 模型定义缺失，请重新设置或重启扩展';
          return;
        }
        
        // 获取当前模型信息
        const modelInfo = config.currentModel === 'custom' && config.customModel && config.customModel.enabled
          ? config.customModel
          : config.modelDefinitions[config.currentModel];
          
        if (!modelInfo) {
          console.error(`未找到模型信息: ${config.currentModel}`);
          elements.outputText.value = `Error: Model information not found for ${config.currentModel}`;
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
          
        if (!apiKey) {
          console.log(`错误: ${modelType} 的API密钥未设置`);
          elements.outputText.value = `Please configure API key in extension settings first.\n\n请先在扩展设置中配置 ${modelType} 的API密钥。`;
          return;
        }
        
        try {
          // 调用翻译API
          const translatedText = await ApiService.translate(text, config);
          elements.outputText.value = translatedText.trim();
        } catch (error) {
          console.error('Translation error:', error);
          elements.outputText.value = `Translation error: ${error.message}`;
        }
      } catch (error) {
        console.error('Translation error:', error);
        elements.outputText.value = `Translation error: ${error.message}`;
      } finally {
        // Restore UI state
        elements.loadingSpinner.classList.remove('visible');
        elements.translateBtn.disabled = false;
      }
    }
    
    /**
     * Toggle API key visibility
     * @param {HTMLElement} inputElement - API密钥输入元素
     * @param {HTMLElement} buttonElement - 显示/隐藏按钮元素
     */
    function toggleApiKeyVisibility(inputElement, buttonElement) {
      const imgElement = buttonElement.querySelector('img');
      
      if (inputElement.type === 'password') {
        inputElement.type = 'text';
        imgElement.src = 'images/eye.png';
        imgElement.alt = 'Hide';
      } else {
        inputElement.type = 'password';
        imgElement.src = 'images/eye-close.png';
        imgElement.alt = 'Show';
      }
    }
    
    /**
     * Save settings
     * @param {object} elements - DOM elements object
     */
    async function saveSettings(elements) {
      try {
        const currentModel = elements.modelSelect.value;
        const isCustomModel = currentModel === 'custom';
        
        // 获取API密钥值
        const siliconFlowKey = elements.siliconFlowApiKey.value.trim();
        const zhipuKey = elements.zhipuApiKey.value.trim();
        const customKey = elements.customApiKey.value.trim();
        
        // 获取选择的母语
        const nativeLanguage = elements.nativeLanguage.value;
        
        // 加载当前配置
        const currentConfig = await ConfigService.load();
        
        // 创建新配置
        const newConfig = {
          ...currentConfig,
          currentModel: currentModel,
          nativeLanguage: nativeLanguage,
          apiKeys: {
            'silicon-flow': siliconFlowKey,
            'zhipu': zhipuKey
          },
          customModel: {
            enabled: isCustomModel,
            name: elements.customModelName.value.trim(),
            apiEndpoint: elements.customModelEndpoint.value.trim(),
            apiKey: customKey,
            type: 'custom'
          }
        };
        
        // 保存配置
        await ConfigService.save(newConfig);
        
        console.log('设置已自动保存');
      } catch (error) {
        console.error('Error saving settings:', error);
      }
    }
    
    /**
     * 执行全网页翻译
     * @param {object} elements - DOM元素对象
     */
    async function translateWebpage(elements) {
      try {
        // 禁用按钮，避免重复点击
        elements.translateWebpageBtn.disabled = true;
        elements.translateWebpageBtn.textContent = 'Translating...';
        
        // 获取当前活动标签页
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!activeTab) {
          throw new Error('无法获取当前标签页');
        }
        
        console.log('发送全网页翻译请求到内容脚本');
        
        // 向内容脚本发送翻译请求
        const response = await chrome.tabs.sendMessage(activeTab.id, { 
          action: 'translateWebpage'
        });
        
        if (!response || !response.success) {
          throw new Error('翻译请求未成功发送');
        }
        
        // 关闭popup窗口
        window.close();
      } catch (error) {
        console.error('执行全网页翻译时出错:', error);
        UiService.showNotification(`全网页翻译失败: ${error.message}`, 'error');
        
        // 重置按钮状态
        elements.translateWebpageBtn.disabled = false;
        elements.translateWebpageBtn.textContent = 'Translate Current Page';
      }
    }
    
    /**
     * 清除网页翻译标签
     * @param {object} elements - DOM元素对象
     */
    async function clearWebpageTranslations(elements) {
      try {
        // 禁用按钮，避免重复点击
        elements.clearTranslationsBtn.disabled = true;
        elements.clearTranslationsBtn.textContent = 'Clearing...';
        
        // 获取当前活动标签页
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!activeTab) {
          throw new Error('无法获取当前标签页');
        }
        
        console.log('发送清除翻译请求到内容脚本');
        
        // 向内容脚本发送清除请求
        const response = await chrome.tabs.sendMessage(activeTab.id, { 
          action: 'clearWebpageTranslations'
        });
        
        if (!response || !response.success) {
          throw new Error('清除请求未成功发送');
        }
        
        // 关闭popup窗口
        window.close();
      } catch (error) {
        console.error('清除网页翻译时出错:', error);
        UiService.showNotification(`清除翻译失败: ${error.message}`, 'error');
        
        // 重置按钮状态
        elements.clearTranslationsBtn.disabled = false;
        elements.clearTranslationsBtn.textContent = 'Clear Translations';
      }
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
}); 