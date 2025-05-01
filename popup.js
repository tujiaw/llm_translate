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
        modelSelect: document.getElementById('modelSelect'),
        customModelConfig: document.getElementById('customModelConfig'),
        customModelName: document.getElementById('customModelName'),
        customModelEndpoint: document.getElementById('customModelEndpoint'),
        siliconFlowApiKey: document.getElementById('siliconFlowApiKey'),
        zhipuApiKey: document.getElementById('zhipuApiKey'),
        customApiKey: document.getElementById('customApiKey'),
        showSiliconFlowKeyBtn: document.getElementById('showSiliconFlowKeyBtn'),
        showZhipuKeyBtn: document.getElementById('showZhipuKeyBtn'),
        showCustomKeyBtn: document.getElementById('showCustomKeyBtn'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn'),
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
     * Set up event listeners
     * @param {object} elements - DOM elements object
     */
    function setupEventListeners(elements) {
      // Translate button click event
      elements.translateBtn.addEventListener('click', () => translateText(elements));
      
      // Show/hide API key buttons
      elements.showSiliconFlowKeyBtn.addEventListener('click', () => toggleApiKeyVisibility(elements.siliconFlowApiKey, elements.showSiliconFlowKeyBtn));
      elements.showZhipuKeyBtn.addEventListener('click', () => toggleApiKeyVisibility(elements.zhipuApiKey, elements.showZhipuKeyBtn));
      elements.showCustomKeyBtn.addEventListener('click', () => toggleApiKeyVisibility(elements.customApiKey, elements.showCustomKeyBtn));
      
      // Save settings button click event
      elements.saveSettingsBtn.addEventListener('click', () => saveSettings(elements));
 
      // Text input change event, used to enable/disable translate button
      elements.inputText.addEventListener('input', () => {
        elements.translateBtn.disabled = !elements.inputText.value.trim();
      });

      // Model select change event
      elements.modelSelect.addEventListener('change', () => {
        const selectedModel = elements.modelSelect.value;
        updateUiForSelectedModel(elements, selectedModel);
      });
      
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
        elements.loadingSpinner.style.display = 'block';
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
          // 检测语言
          const isChineseQuery = Utils.isChineseText(text);
          console.log('Is Chinese query:', isChineseQuery);
          
          // 调用翻译API
          const translatedText = await ApiService.translate(text, config);
          elements.outputText.value = translatedText;
        } catch (error) {
          console.error('Translation error:', error);
          elements.outputText.value = `Translation error: ${error.message}`;
        }
      } catch (error) {
        console.error('Translation error:', error);
        elements.outputText.value = `Translation error: ${error.message}`;
      } finally {
        // Restore UI state
        elements.loadingSpinner.style.display = 'none';
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
        
        // 加载当前配置
        const currentConfig = await ConfigService.load();
        
        // 创建新配置
        const newConfig = {
          ...currentConfig,
          currentModel: currentModel,
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
        
        // 验证保存是否成功
        const verifyConfig = await ConfigService.load();
        const modelType = currentModel === 'custom' ? 'custom' : 
                          (currentModel.startsWith('glm-4-flash') ? 'zhipu' : 'silicon-flow');
        
        // 检查API密钥是否保存成功
        const keyExists = modelType === 'custom' ? 
                           Boolean(verifyConfig.customModel && verifyConfig.customModel.apiKey) :
                           Boolean(verifyConfig.apiKeys && verifyConfig.apiKeys[modelType]);
        
        console.log(`验证: ${modelType} API密钥存在: ${keyExists}`);
        
        // Show save success notification
        const saveStatus = document.createElement('div');
        saveStatus.textContent = keyExists ? 'Settings saved successfully' : 'Warning: API key may not be saved properly';
        saveStatus.style.color = keyExists ? 'green' : 'orange';
        saveStatus.style.textAlign = 'center';
        saveStatus.style.marginTop = '5px';
        
        // 移除已有的状态消息
        const existingStatus = document.querySelector('.save-status');
        if (existingStatus) {
          existingStatus.remove();
        }
        
        saveStatus.className = 'save-status';
        elements.saveSettingsBtn.insertAdjacentElement('afterend', saveStatus);
        
        setTimeout(() => {
          saveStatus.remove();
        }, 3000);
        
      } catch (error) {
        console.error('Error saving settings:', error);
        
        // 显示保存失败消息
        const saveStatus = document.createElement('div');
        saveStatus.textContent = `Error: ${error.message}`;
        saveStatus.style.color = 'red';
        saveStatus.style.textAlign = 'center';
        saveStatus.style.marginTop = '5px';
        saveStatus.className = 'save-status';
        elements.saveSettingsBtn.insertAdjacentElement('afterend', saveStatus);
        
        setTimeout(() => {
          saveStatus.remove();
        }, 3000);
      }
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
}); 