// popup.js - 弹出窗口脚本
// 使用动态导入获取模块
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
    
    console.log('初始化弹出窗口');
    
    // 获取DOM元素
    const elements = getDomElements();
    
    // 从存储中加载设置
    await loadSettings(elements);
    
    // 设置事件监听器
    setupEventListeners(elements);
    
    // 检查是否有选中的文本传递过来
    await checkForSelectedText(elements);
    
    /**
     * 获取DOM元素
     * @returns {object} DOM元素对象
     */
    function getDomElements() {
      return {
        inputText: document.getElementById('inputText'),
        outputText: document.getElementById('outputText'),
        translateBtn: document.getElementById('translateBtn'),
        copyBtn: document.getElementById('copyBtn'),
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
     * 加载配置设置
     * @param {object} elements - DOM元素对象
     */
    async function loadSettings(elements) {
      try {
        console.log('加载设置...');
        const config = await ConfigService.load();
        console.log('已加载设置:', { ...config, apiKey: '******' });
        
        elements.modelSelect.value = config.model;
        elements.customModelName.value = config.customModelName;
        elements.customModelEndpoint.value = config.customModelEndpoint;
        elements.apiKey.value = config.apiKey;
        
        // 根据当前选择的模型显示/隐藏自定义模型配置
        toggleCustomModelConfig(elements);
      } catch (error) {
        console.error('加载设置时出错:', error);
        UiService.showNotification('加载设置时出错: ' + error.message, 'error');
      }
    }
    
    /**
     * 切换显示/隐藏自定义模型配置
     * @param {object} elements - DOM元素对象
     */
    function toggleCustomModelConfig(elements) {
      if (elements.modelSelect.value === 'custom') {
        elements.customModelConfig.classList.remove('hidden');
      } else {
        elements.customModelConfig.classList.add('hidden');
      }
    }
    
    /**
     * 设置事件监听器
     * @param {object} elements - DOM元素对象
     */
    function setupEventListeners(elements) {
      // 翻译按钮点击事件
      elements.translateBtn.addEventListener('click', () => translateText(elements));
      
      // 复制按钮点击事件
      elements.copyBtn.addEventListener('click', () => copyToClipboard(elements));
      
      // 显示/隐藏API密钥按钮点击事件
      elements.showKeyBtn.addEventListener('click', () => toggleApiKeyVisibility(elements));
      
      // 保存设置按钮点击事件
      elements.saveSettingsBtn.addEventListener('click', () => saveSettings(elements));
      
      // 模型选择变化事件
      elements.modelSelect.addEventListener('change', () => toggleCustomModelConfig(elements));
      
      // 文本输入变化事件，用于启用/禁用翻译按钮
      elements.inputText.addEventListener('input', () => {
        elements.translateBtn.disabled = !elements.inputText.value.trim();
      });
    }
    
    /**
     * 检查是否有选中的文本要传递过来
     * @param {object} elements - DOM元素对象
     */
    async function checkForSelectedText(elements) {
      try {
        // 查询当前活动标签
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        
        // 发送消息获取选中的文本
        chrome.tabs.sendMessage(tabs[0].id, {action: "getSelectedText"}, function(response) {
          if (response && response.selectedText) {
            elements.inputText.value = response.selectedText;
            elements.translateBtn.disabled = false;
          }
        });
      } catch (error) {
        console.error('获取选中文本时出错:', error);
      }
    }
    
    /**
     * 翻译文本
     * @param {object} elements - DOM元素对象
     */
    async function translateText(elements) {
      console.log('开始翻译...');
      const text = elements.inputText.value.trim();
      
      if (!text) {
        console.log('没有输入文本，翻译取消');
        return;
      }
      
      try {
        // 显示加载状态
        elements.loadingSpinner.style.display = 'block';
        elements.translateBtn.disabled = true;
        
        // 加载配置
        const config = await ConfigService.load();
        
        // 验证API密钥
        if (!config.apiKey) {
          console.log('错误: API密钥未设置');
          elements.outputText.value = '错误：请在设置中配置API密钥';
          return;
        }
        
        // 发送API请求并获取翻译结果
        const isChineseQuery = Utils.isChineseText(text);
        console.log('是否中文查询:', isChineseQuery);
        
        try {
          // 创建请求配置
          const { apiEndpoint, requestBody } = ApiService.createRequestConfig(
            config,
            text,
            isChineseQuery
          );
          
          console.log('使用API端点:', apiEndpoint);
          
          // 验证API端点
          if (!ApiService.validateApiEndpoint(apiEndpoint)) {
            throw new Error(`无效的API端点: "${apiEndpoint}"`);
          }
          
          // 发送API请求
          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(requestBody)
          });
          
          if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
          }
          
          const data = await response.json();
          
          // 解析响应
          const translatedText = ApiService.parseApiResponse(data, config.model);
          elements.outputText.value = translatedText;
        } catch (error) {
          console.error('翻译过程中出错:', error);
          elements.outputText.value = `翻译时出错: ${error.message}`;
        }
      } catch (error) {
        console.error('翻译出错:', error);
        elements.outputText.value = `翻译时出错: ${error.message}`;
      } finally {
        // 恢复UI状态
        elements.loadingSpinner.style.display = 'none';
        elements.translateBtn.disabled = false;
      }
    }
    
    /**
     * 切换API密钥可见性
     * @param {object} elements - DOM元素对象
     */
    function toggleApiKeyVisibility(elements) {
      if (elements.apiKey.type === 'password') {
        elements.apiKey.type = 'text';
        elements.showKeyBtn.textContent = '隐藏';
      } else {
        elements.apiKey.type = 'password';
        elements.showKeyBtn.textContent = '显示';
      }
    }
    
    /**
     * 复制翻译结果到剪贴板
     * @param {object} elements - DOM元素对象
     */
    function copyToClipboard(elements) {
      const text = elements.outputText.value;
      if (!text) return;
      
      navigator.clipboard.writeText(text).then(() => {
        // 显示复制成功提示
        const original = elements.copyBtn.innerHTML;
        elements.copyBtn.innerHTML = '<img src="images/check.svg" alt="Copied">';
        
        setTimeout(() => {
          elements.copyBtn.innerHTML = original;
        }, 1500);
      }).catch(err => {
        console.error('Failed to copy text: ', err);
        // 如果复制失败，尝试使用旧的复制方法
        elements.outputText.select();
        document.execCommand('copy');
        elements.copyBtn.innerHTML = '<img src="images/check.svg" alt="Copied">';
        setTimeout(() => {
          elements.copyBtn.innerHTML = original;
        }, 1500);
      });
    }
    
    /**
     * 保存设置
     * @param {object} elements - DOM元素对象
     */
    async function saveSettings(elements) {
      try {
        const model = elements.modelSelect.value;
        const customModelName = elements.customModelName.value;
        const customModelEndpoint = elements.customModelEndpoint.value;
        const apiKey = elements.apiKey.value;
        
        console.log('保存设置:', {
          model: model,
          customModelName: customModelName,
          customModelEndpoint: customModelEndpoint,
          apiKey: '******' // 隐藏实际密钥
        });
        
        await ConfigService.save({
          model: model,
          customModelName: customModelName,
          customModelEndpoint: customModelEndpoint,
          apiKey: apiKey,
          // 保持默认API端点不变
          defaultApiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
        });
        
        // 显示保存成功提示
        const saveStatus = document.createElement('div');
        saveStatus.textContent = '设置已保存';
        saveStatus.style.color = 'green';
        saveStatus.style.textAlign = 'center';
        saveStatus.style.marginTop = '5px';
        
        elements.saveSettingsBtn.insertAdjacentElement('afterend', saveStatus);
        
        setTimeout(() => {
          saveStatus.remove();
        }, 2000);
        
        console.log('设置已保存成功');
      } catch (error) {
        console.error('保存设置时出错:', error);
        UiService.showNotification('保存设置时出错: ' + error.message, 'error');
      }
    }
  } catch (error) {
    console.error('加载模块时出错:', error);
    document.body.innerHTML = `<div style="color: red; padding: 20px;">
      加载模块时出错: ${error.message}
      <p>请尝试重新加载扩展或联系开发者</p>
    </div>`;
  }
}); 