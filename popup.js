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
        apiKey: document.getElementById('apiKey'),
        showKeyBtn: document.getElementById('showKeyBtn'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn'),
        loadingSpinner: document.getElementById('loadingSpinner')
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
        console.log('Settings loaded:', { ...config, apiKey: '******' });
        
        elements.modelSelect.value = config.model;
        elements.customModelName.value = config.customModelName;
        elements.customModelEndpoint.value = config.customModelEndpoint;
        elements.apiKey.value = config.apiKey;
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
      
      // Show/hide API key button click event
      elements.showKeyBtn.addEventListener('click', () => toggleApiKeyVisibility(elements));
      
      // Save settings button click event
      elements.saveSettingsBtn.addEventListener('click', () => saveSettings(elements));
 
      // Text input change event, used to enable/disable translate button
      elements.inputText.addEventListener('input', () => {
        elements.translateBtn.disabled = !elements.inputText.value.trim();
      });

      // Model select change event, auto save settings
      elements.modelSelect.addEventListener('change', () => saveSettings(elements));
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
        
        // Validate API key
        if (!config.apiKey) {
          console.log('Error: API key not set');
          elements.outputText.value = 'Error: Please configure API key in settings';
          return;
        }
        
        // Send API request and get translation result
        const isChineseQuery = Utils.isChineseText(text);
        console.log('Is Chinese query:', isChineseQuery);
        
        try {
          // Create request configuration
          const { apiEndpoint, requestBody } = ApiService.createRequestConfig(
            config,
            text,
            isChineseQuery
          );
          
          console.log('Using API endpoint:', apiEndpoint);
          
          // Validate API endpoint
          if (!ApiService.validateApiEndpoint(apiEndpoint)) {
            throw new Error(`Invalid API endpoint: "${apiEndpoint}"`);
          }
          
          // Send API request
          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(requestBody)
          });
          
          if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
          }
          
          const data = await response.json();
          
          // Parse response
          const translatedText = ApiService.parseApiResponse(data, config.model);
          elements.outputText.value = translatedText;
        } catch (error) {
          console.error('Error during translation:', error);
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
     * @param {object} elements - DOM elements object
     */
    function toggleApiKeyVisibility(elements) {
      if (elements.apiKey.type === 'password') {
        elements.apiKey.type = 'text';
        elements.showKeyBtn.textContent = 'Hide';
      } else {
        elements.apiKey.type = 'password';
        elements.showKeyBtn.textContent = 'Show';
      }
    }
    
    /**
     * Save settings
     * @param {object} elements - DOM elements object
     */
    async function saveSettings(elements) {
      try {
        const model = elements.modelSelect.value;
        const customModelName = elements.customModelName.value;
        const customModelEndpoint = elements.customModelEndpoint.value;
        const apiKey = elements.apiKey.value;
        
        console.log('Saving settings:', {
          model: model,
          customModelName: customModelName,
          customModelEndpoint: customModelEndpoint,
          apiKey: '******' // Hide actual key
        });
        
        await ConfigService.save({
          model: model,
          customModelName: customModelName,
          customModelEndpoint: customModelEndpoint,
          apiKey: apiKey,
          // Keep default API endpoint unchanged
          defaultApiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
        });
        
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
        
        console.log('Settings saved successfully');
      } catch (error) {
        console.error('Error saving settings:', error);
        UiService.showNotification('Error saving settings: ' + error.message, 'error');
      }
    }
  } catch (error) {
    console.error('Error loading modules:', error);
    document.body.innerHTML = `<div style="color: red; padding: 20px;">
      Error loading modules: ${error.message}
      <p>Please try reloading the extension or contact the developer</p>
    </div>`;
  }
}); 