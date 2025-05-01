// popup.js - Popup window script
// Use dynamic imports to get modules
document.addEventListener('DOMContentLoaded', async function() {
  try {
    const [configModule, translatorModule, uiModule, messagingModule, utilsModule, apiModule] = await Promise.all([
      import(chrome.runtime.getURL('config.js')),
      import(chrome.runtime.getURL('translator.js')),
      import(chrome.runtime.getURL('ui.js')),
      import(chrome.runtime.getURL('messaging.js')),
      import(chrome.runtime.getURL('utils.js')),
      import(chrome.runtime.getURL('api.js'))
    ]);
    
    const ConfigService = configModule.default;
    const TranslatorService = translatorModule.default;
    const UiService = uiModule.default;
    const MessagingService = messagingModule.default;
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
        console.log('Settings loaded:', JSON.stringify({
          ...config,
          apiKeys: {
            'silicon-flow': '******',
            'zhipu': '******',
          }
        }));
        
        // 设置当前选择的模型
        elements.modelSelect.value = config.currentModel;
        
        // 设置API密钥
        elements.siliconFlowApiKey.value = config.apiKeys['silicon-flow'] || '';
        elements.zhipuApiKey.value = config.apiKeys['zhipu'] || '';
        elements.customApiKey.value = config.customModel.apiKey || '';
        
        // 显示/隐藏自定义模型配置
        if (config.currentModel === 'custom') {
          elements.customModelConfig.classList.remove('hidden');
          elements.customModelName.value = config.customModel.name || '';
          elements.customModelEndpoint.value = config.customModel.apiEndpoint || '';
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
        
        // 获取当前模型信息
        const modelInfo = config.currentModel === 'custom' && config.customModel.enabled
          ? config.customModel
          : config.modelDefinitions[config.currentModel];
          
        // 检查API密钥
        const modelType = modelInfo.type;
        const apiKey = modelType === 'custom' 
          ? config.customModel.apiKey 
          : config.apiKeys[modelType];
          
        if (!apiKey) {
          console.log(`错误: ${modelType} 的API密钥未设置`);
          elements.outputText.value = `错误: 请在设置中配置 ${modelType} 的API密钥`;
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
        imgElement.src = 'images/eye-close.png';
        imgElement.alt = 'Hide';
      } else {
        inputElement.type = 'password';
        imgElement.src = 'images/eye.png';
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
        
        // 加载当前配置
        const currentConfig = await ConfigService.load();
        
        // 创建新配置
        const newConfig = {
          ...currentConfig,
          currentModel: currentModel,
          apiKeys: {
            'silicon-flow': elements.siliconFlowApiKey.value,
            'zhipu': elements.zhipuApiKey.value
          },
          customModel: {
            enabled: isCustomModel,
            name: elements.customModelName.value,
            apiEndpoint: elements.customModelEndpoint.value,
            apiKey: elements.customApiKey.value,
            type: 'custom'
          }
        };
        
        console.log('Saving settings:', JSON.stringify({
          ...newConfig,
          apiKeys: {
            'silicon-flow': '******',
            'zhipu': '******'
          },
          customModel: {
            ...newConfig.customModel,
            apiKey: '******'
          }
        }));
        
        await ConfigService.save(newConfig);
        
        // Show save success notification
        const saveStatus = document.createElement('div');
        saveStatus.textContent = 'Settings saved';
        saveStatus.style.color = 'green';
        saveStatus.style.textAlign = 'center';
        saveStatus.style.marginTop = '5px';
        
        elements.saveSettingsBtn.insertAdjacentElement('afterend', saveStatus);
        
        setTimeout(() => {
          saveStatus.remove();
        }, 2000);
        
      } catch (error) {
        console.error('Error saving settings:', error);
        UiService.showNotification('Error saving settings: ' + error.message, 'error');
      }
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
}); 