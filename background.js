// 在插件安装或更新时执行
chrome.runtime.onInstalled.addListener(function() {
  console.log('插件已安装或更新');
  // 创建右键菜单
  chrome.contextMenus.create({
    id: "translateSelection",
    title: "翻译选中文本",
    contexts: ["selection"]
  });
  console.log('已创建右键菜单');
  
  // 设置默认配置
  chrome.storage.sync.get(
    {
      model: 'THUDM/GLM-4-9B-0414',
      customModelName: '',
      customModelEndpoint: '',
      apiKey: 'sk-yhszqcrexlxohbqlqjnxngoqenrtftzxvuvhdqzdjydtpoic',
      defaultApiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
    }, 
    function(items) {
      // 如果是首次安装且没有设置过，设置默认值
      if (!items.model) {
        console.log('首次安装，设置默认配置');
        chrome.storage.sync.set({
          model: 'THUDM/GLM-4-9B-0414',
          customModelName: '',
          customModelEndpoint: '',
          apiKey: 'sk-yhszqcrexlxohbqlqjnxngoqenrtftzxvuvhdqzdjydtpoic',
          defaultApiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions'
        });
      } else {
        console.log('已有配置，无需设置默认值');
      }
    }
  );
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === "translateSelection") {
    const selectedText = info.selectionText;
    console.log('右键菜单触发翻译，选中文本:', selectedText);
    
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
  console.log('接收到消息:', request);
  if (request.action === "performTranslation") {
    const tabId = sender.tab ? sender.tab.id : null;
    console.log('消息请求翻译，文本:', request.text, '标签ID:', tabId);
    performTranslation(request.text, tabId);
  }
  return true;
});

// 添加函数，用于验证API端点
function validateApiEndpoint(url) {
  try {
    const endpointUrl = new URL(url);
    console.log('API端点有效:', url);
    return true;
  } catch (e) {
    console.error('API端点无效:', url, e);
    return false;
  }
}

// 执行翻译操作
function performTranslation(text, tabId) {
  console.log('执行翻译操作，文本:', text, '标签ID:', tabId);
  if (!text || text.trim() === '') {
    console.log('文本为空，取消翻译');
    return;
  }
  
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
      console.log('加载的配置:', {
        model: items.model,
        customModelName: items.customModelName, 
        customModelEndpoint: items.customModelEndpoint,
        apiKey: '******', // 隐藏实际密钥
        defaultApiEndpoint: items.defaultApiEndpoint
      });
      
      const apiKeyValue = items.apiKey;
      
      if (!apiKeyValue) {
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
      const systemPrompt = isChineseQuery 
        ? "你是一个翻译助手，请将以下中文文本翻译成英文，保持原文的意思、格式和语气。只输出翻译结果，不要有任何解释或额外内容。" 
        : "你是一个翻译助手，请将以下英文文本翻译成中文，保持原文的意思、格式和语气。只输出翻译结果，不要有任何解释或额外内容。";
      
      let apiEndpoint, requestBody;
      const model = items.model;
      console.log('使用模型:', model);
      
      // 根据模型配置API请求
      if (model === 'custom' && items.customModelEndpoint) {
        console.log('使用自定义模型配置');
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
        console.log('使用OpenAI模型');
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
        console.log('使用Claude模型');
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
        console.log('使用Gemini模型');
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
        console.log('使用免费模型:', model);
        // 免费模型 API
        if (!items.defaultApiEndpoint) {
          console.error('默认API端点未设置');
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              action: "translate",
              text: text,
              result: "错误：默认API端点未设置，请联系插件开发者"
            });
          }
          return;
        }
        
        apiEndpoint = items.defaultApiEndpoint;
        console.log('免费模型使用端点:', apiEndpoint);
        
        requestBody = {
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ],
          temperature: 0.3
        };
      }
      
      console.log('API端点:', apiEndpoint);
      console.log('请求体:', JSON.stringify(requestBody, null, 2));
      
      // 在发送API请求前添加验证
      if (!validateApiEndpoint(apiEndpoint)) {
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
          'Authorization': `Bearer ${apiKeyValue}`
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
        // 根据不同API解析响应
        let translatedText = '';
        
        try {
          if (model === 'gpt-3.5-turbo' || model === 'gpt-4') {
            translatedText = data.choices[0].message.content;
          } else if (model.startsWith('claude')) {
            translatedText = data.content[0].text;
          } else if (model.startsWith('gemini')) {
            translatedText = data.candidates[0].content.parts[0].text;
          } else if (model.startsWith('THUDM/') || model.startsWith('Qwen/')) {
            console.log('解析免费模型响应');
            // 免费模型响应解析
            translatedText = data.choices[0].message.content;
          } else {
            // 自定义模型，尝试通用解析方法
            translatedText = data.choices ? 
              data.choices[0].message.content : 
              (data.response || data.output || data.result || JSON.stringify(data));
          }
        } catch (error) {
          console.error('解析响应数据时出错:', error);
          translatedText = `解析响应数据时出错: ${error.message}\n\n原始响应: ${JSON.stringify(data, null, 2).substring(0, 500)}...`;
        }
        
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
    }
  );
} 