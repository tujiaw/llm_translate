document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const inputText = document.getElementById('inputText');
  const outputText = document.getElementById('outputText');
  const translateBtn = document.getElementById('translateBtn');
  const copyBtn = document.getElementById('copyBtn');
  const modelSelect = document.getElementById('modelSelect');
  const customModelConfig = document.getElementById('customModelConfig');
  const customModelName = document.getElementById('customModelName');
  const customModelEndpoint = document.getElementById('customModelEndpoint');
  const apiKey = document.getElementById('apiKey');
  const showKeyBtn = document.getElementById('showKeyBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const loadingSpinner = document.getElementById('loadingSpinner');
  
  // 从存储中加载设置
  loadSettings();
  
  // 事件监听器
  translateBtn.addEventListener('click', translateText);
  copyBtn.addEventListener('click', copyToClipboard);
  showKeyBtn.addEventListener('click', toggleApiKeyVisibility);
  saveSettingsBtn.addEventListener('click', saveSettings);
  modelSelect.addEventListener('change', function() {
    if (modelSelect.value === 'custom') {
      customModelConfig.classList.remove('hidden');
    } else {
      customModelConfig.classList.add('hidden');
    }
  });
  
  // 检测文本输入框内容自动设置
  inputText.addEventListener('input', function() {
    const text = inputText.value.trim();
    if (text) {
      translateBtn.disabled = false;
    } else {
      translateBtn.disabled = true;
    }
  });
  
  // 加载设置
  function loadSettings() {
    chrome.storage.sync.get(
      {
        model: 'THUDM/GLM-4-9B-0414',
        customModelName: '',
        customModelEndpoint: '',
        apiKey: 'sk-yhszqcrexlxohbqlqjnxngoqenrtftzxvuvhdqzdjydtpoic',
        defaultApiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
      }, 
      function(items) {
        modelSelect.value = items.model;
        customModelName.value = items.customModelName;
        customModelEndpoint.value = items.customModelEndpoint;
        apiKey.value = items.apiKey;
        
        if (items.model === 'custom') {
          customModelConfig.classList.remove('hidden');
        } else {
          customModelConfig.classList.add('hidden');
        }
      }
    );
  }
  
  // 保存设置
  function saveSettings() {
    const model = modelSelect.value;
    const customModelNameValue = customModelName.value;
    const customModelEndpointValue = customModelEndpoint.value;
    const apiKeyValue = apiKey.value;
    
    chrome.storage.sync.set({
      model: model,
      customModelName: customModelNameValue,
      customModelEndpoint: customModelEndpointValue,
      apiKey: apiKeyValue
    }, function() {
      // 显示保存成功提示
      const saveStatus = document.createElement('div');
      saveStatus.textContent = '设置已保存';
      saveStatus.style.color = 'green';
      saveStatus.style.textAlign = 'center';
      saveStatus.style.marginTop = '5px';
      
      saveSettingsBtn.insertAdjacentElement('afterend', saveStatus);
      
      setTimeout(() => {
        saveStatus.remove();
      }, 2000);
    });
  }
  
  // 切换API密钥可见性
  function toggleApiKeyVisibility() {
    if (apiKey.type === 'password') {
      apiKey.type = 'text';
      showKeyBtn.textContent = '隐藏';
    } else {
      apiKey.type = 'password';
      showKeyBtn.textContent = '显示';
    }
  }
  
  // 复制到剪贴板
  function copyToClipboard() {
    const text = outputText.value;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(function() {
      // 复制成功提示
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = '<img src="images/check.svg" alt="已复制">';
      
      setTimeout(() => {
        copyBtn.innerHTML = original;
      }, 1500);
    });
  }
  
  // 翻译文本
  function translateText() {
    const text = inputText.value.trim();
    if (!text) return;
    
    const model = modelSelect.value;
    let endpoint, apiKeyValue;
    
    // 获取当前设置
    chrome.storage.sync.get(
      {
        model: 'THUDM/GLM-4-9B-0414',
        customModelName: '',
        customModelEndpoint: '',
        apiKey: 'sk-yhszqcrexlxohbqlqjnxngoqenrtftzxvuvhdqzdjydtpoic',
        defaultApiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
      }, 
      function(items) {
        apiKeyValue = items.apiKey;
        
        if (!apiKeyValue) {
          outputText.value = '错误：请在设置中配置API密钥';
          return;
        }
        
        // 显示加载状态
        loadingSpinner.style.display = 'block';
        translateBtn.disabled = true;
        
        // 检测语言
        const isChineseQuery = /[\u4e00-\u9fa5]/.test(text);
        const systemPrompt = isChineseQuery 
          ? "你是一个翻译助手，请将以下中文文本翻译成英文，保持原文的意思、格式和语气。只输出翻译结果，不要有任何解释或额外内容。" 
          : "你是一个翻译助手，请将以下英文文本翻译成中文，保持原文的意思、格式和语气。只输出翻译结果，不要有任何解释或额外内容。";
        
        let apiEndpoint, requestBody;
        
        // 根据模型配置API请求
        if (model === 'custom' && items.customModelEndpoint) {
          apiEndpoint = items.customModelEndpoint;
          // 自定义模型使用通用请求格式，可能需要根据实际API调整
          requestBody = {
            model: items.customModelName || 'default',
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ]
          };
        } else if (model === 'gpt-3.5-turbo' || model === 'gpt-4') {
          // OpenAI API
          apiEndpoint = 'https://api.openai.com/v1/chat/completions';
          requestBody = {
            model: model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ],
            temperature: 0.3
          };
        } else if (model.startsWith('claude')) {
          // Anthropic API
          apiEndpoint = 'https://api.anthropic.com/v1/messages';
          requestBody = {
            model: model,
            system: systemPrompt,
            messages: [
              { role: "user", content: text }
            ],
            max_tokens: 1000
          };
        } else if (model.startsWith('gemini')) {
          // Google Gemini API
          apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
          requestBody = {
            contents: [
              {
                role: "user",
                parts: [{ text: systemPrompt + "\n\n" + text }]
              }
            ],
            generationConfig: {
              temperature: 0.2
            }
          };
        } else if (model.startsWith('THUDM/') || model.startsWith('Qwen/')) {
          // 免费模型 API
          apiEndpoint = items.defaultApiEndpoint;
          requestBody = {
            model: model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ],
            temperature: 0.3
          };
        }
        
        // 发送API请求
        fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKeyValue}`
          },
          body: JSON.stringify(requestBody)
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          // 根据不同API解析响应
          let translatedText = '';
          
          if (model === 'gpt-3.5-turbo' || model === 'gpt-4') {
            translatedText = data.choices[0].message.content;
          } else if (model.startsWith('claude')) {
            translatedText = data.content[0].text;
          } else if (model.startsWith('gemini')) {
            translatedText = data.candidates[0].content.parts[0].text;
          } else if (model.startsWith('THUDM/') || model.startsWith('Qwen/')) {
            // 免费模型响应解析
            translatedText = data.choices[0].message.content;
          } else {
            // 自定义模型，尝试通用解析方法
            translatedText = data.choices ? 
              data.choices[0].message.content : 
              (data.response || data.output || data.result || JSON.stringify(data));
          }
          
          outputText.value = translatedText;
        })
        .catch(error => {
          outputText.value = `翻译时出错: ${error.message}`;
          console.error('Translation error:', error);
        })
        .finally(() => {
          loadingSpinner.style.display = 'none';
          translateBtn.disabled = false;
        });
      }
    );
  }
  
  // 检查是否有选中的文本传递过来
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "getSelectedText"}, function(response) {
      if (response && response.selectedText) {
        inputText.value = response.selectedText;
      }
    });
  });
}); 