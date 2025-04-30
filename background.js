// 在插件安装或更新时执行
chrome.runtime.onInstalled.addListener(function() {
  // 创建右键菜单
  chrome.contextMenus.create({
    id: "translateSelection",
    title: "翻译选中文本",
    contexts: ["selection"]
  });
  
  // 设置默认配置
  chrome.storage.sync.get(
    {
      model: 'gpt-3.5-turbo',
      customModelName: '',
      customModelEndpoint: '',
      apiKey: ''
    }, 
    function(items) {
      // 如果是首次安装且没有设置过，设置默认值
      if (!items.model) {
        chrome.storage.sync.set({
          model: 'gpt-3.5-turbo',
          customModelName: '',
          customModelEndpoint: '',
          apiKey: ''
        });
      }
    }
  );
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === "translateSelection") {
    const selectedText = info.selectionText;
    
    // 发送消息到内容脚本
    chrome.tabs.sendMessage(tab.id, {
      action: "showLoadingPopup"
    });
    
    // 执行翻译
    performTranslation(selectedText, tab.id);
  }
});

// 监听来自弹出窗口或内容脚本的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "performTranslation") {
    const tabId = sender.tab ? sender.tab.id : null;
    performTranslation(request.text, tabId);
  }
  return true;
});

// 执行翻译操作
function performTranslation(text, tabId) {
  if (!text || text.trim() === '') return;
  
  // 获取当前设置
  chrome.storage.sync.get(
    {
      model: 'gpt-3.5-turbo',
      customModelName: '',
      customModelEndpoint: '',
      apiKey: ''
    }, 
    function(items) {
      const apiKeyValue = items.apiKey;
      
      if (!apiKeyValue) {
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
      const systemPrompt = isChineseQuery 
        ? "你是一个翻译助手，请将以下中文文本翻译成英文，保持原文的意思、格式和语气。只输出翻译结果，不要有任何解释或额外内容。" 
        : "你是一个翻译助手，请将以下英文文本翻译成中文，保持原文的意思、格式和语气。只输出翻译结果，不要有任何解释或额外内容。";
      
      let apiEndpoint, requestBody;
      const model = items.model;
      
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
        } else {
          // 自定义模型，尝试通用解析方法
          translatedText = data.choices ? 
            data.choices[0].message.content : 
            (data.response || data.output || data.result || JSON.stringify(data));
        }
        
        // 将翻译结果发送回内容脚本
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: "translate",
            text: text,
            result: translatedText
          });
        }
      })
      .catch(error => {
        // 发送错误信息回内容脚本
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: "translate",
            text: text,
            result: `翻译出错: ${error.message}`
          });
        }
        console.error('Translation error:', error);
      });
    }
  );
} 