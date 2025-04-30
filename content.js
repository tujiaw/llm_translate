// 全局变量
let selectedText = '';
let translationPopup = null;
let isExtensionActive = true;

console.log('内容脚本已加载');

// 处理扩展上下文失效
function handleExtensionInvalidation() {
  isExtensionActive = false;
  console.warn('扩展上下文已失效，某些功能可能无法正常工作');
}

// 监听消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  try {
    console.log('内容脚本收到消息:', request);
    
    if (request.action === "getSelectedText") {
      console.log('发送选中文本:', selectedText);
      sendResponse({selectedText: selectedText});
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
  } catch (error) {
    console.error('处理消息时出错:', error);
    if (error.message.includes('Extension context invalidated')) {
      handleExtensionInvalidation();
    }
  }
  return true;
});

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

// 监听文本选择
document.addEventListener('mouseup', function(event) {
  selectedText = window.getSelection().toString().trim();
  
  if (selectedText) {
    console.log('选中文本:', selectedText);
  }
  
  // 检查是否存在翻译弹窗，如果有则移除
  if (translationPopup) {
    document.body.removeChild(translationPopup);
    translationPopup = null;
  }
  
  // 如果有选中的文本，创建快速翻译按钮
  if (selectedText.length > 0) {
    const x = event.pageX;
    const y = event.pageY;
    console.log('创建翻译按钮，位置:', x, y);
    createTranslateButton(x, y, selectedText);
  }
});

// 创建快速翻译按钮
function createTranslateButton(x, y, textToTranslate) {
  const button = document.createElement('div');
  button.className = 'llm-translate-button';
  button.innerText = '翻译';
  
  // 按钮样式
  button.style.position = 'absolute';
  button.style.left = `${x}px`;
  button.style.top = `${y + 20}px`;
  button.style.zIndex = '10000';
  button.style.backgroundColor = '#4CAF50';
  button.style.color = 'white';
  button.style.padding = '5px 10px';
  button.style.borderRadius = '4px';
  button.style.cursor = 'pointer';
  button.style.fontSize = '14px';
  button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  
  // 将要翻译的文本保存在按钮的数据属性中
  button.dataset.textToTranslate = textToTranslate;
  
  // 鼠标悬停效果
  button.onmouseover = function() {
    this.style.backgroundColor = '#45a049';
  };
  button.onmouseout = function() {
    this.style.backgroundColor = '#4CAF50';
  };
  
  // 点击事件
  button.onclick = function(e) {
    console.log('翻译按钮被点击');
    e.stopPropagation();
    
    try {
      // 从按钮的数据属性中获取要翻译的文本
      const textToTranslate = this.dataset.textToTranslate;
      
      // 确认文本非空
      if (!textToTranslate || textToTranslate.trim() === '') {
        console.error('错误: 要翻译的文本为空');
        return;
      }
      
      console.log('准备翻译文本:', textToTranslate);
      
      // 移除按钮
      if (document.body.contains(button)) {
        document.body.removeChild(button);
      }
      
      // 显示加载中的弹窗
      showLoadingPopup(x, y);
      
      // 通知后台脚本进行翻译
      console.log('发送翻译请求到后台脚本, 文本:', textToTranslate);
      safeSendMessage({
        action: "performTranslation",
        text: textToTranslate
      }, function(response) {
        // 检查是否有错误发生
        if (response.error) {
          console.error('发送消息时出错:', response.error);
          
          // 如果弹窗存在，显示错误信息
          if (translationPopup && document.body.contains(translationPopup)) {
            handleTranslation(textToTranslate, response.error);
          }
        }
      });
    } catch (error) {
      console.error('处理翻译点击时出错:', error);
      
      // 显示加载中的弹窗（如果尚未显示）
      if (!translationPopup) {
        try {
          showLoadingPopup(x, y);
        } catch (popupError) {
          console.error('显示弹窗时出错:', popupError);
          return;
        }
      }
      
      // 在弹窗中显示错误
      if (translationPopup && document.body.contains(translationPopup)) {
        try {
          handleTranslation(this.dataset.textToTranslate || '未知文本', `错误: ${error.message || "未知错误"}`);
        } catch (handlingError) {
          console.error('显示错误信息时出错:', handlingError);
        }
      }
    }
  };
  
  document.body.appendChild(button);
  
  // 点击页面其他位置移除按钮
  document.addEventListener('mousedown', function removeButton(e) {
    // 如果button已经不存在，移除事件监听器并返回
    if (!button || !document.body.contains(button)) {
      document.removeEventListener('mousedown', removeButton);
      return;
    }
    
    if (e.target !== button) {
      if (document.body.contains(button)) {
        console.log('移除翻译按钮');
        document.body.removeChild(button);
      }
      document.removeEventListener('mousedown', removeButton);
    }
  });
}

// 显示加载中的弹窗
function showLoadingPopup(x, y) {
  console.log('显示加载中弹窗，位置:', x, y);
  translationPopup = document.createElement('div');
  translationPopup.className = 'llm-translation-popup';
  
  // 弹窗样式
  translationPopup.style.position = 'absolute';
  translationPopup.style.left = `${x}px`;
  translationPopup.style.top = `${y + 20}px`;
  translationPopup.style.zIndex = '10000';
  translationPopup.style.backgroundColor = 'white';
  translationPopup.style.padding = '15px';
  translationPopup.style.borderRadius = '8px';
  translationPopup.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
  translationPopup.style.minWidth = '200px';
  translationPopup.style.maxWidth = '400px';
  
  // 加载指示器
  const loader = document.createElement('div');
  loader.style.textAlign = 'center';
  loader.style.padding = '10px';
  loader.innerHTML = `
    <div style="display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(0,0,0,0.1); border-radius: 50%; border-top: 3px solid #4CAF50; animation: llm-translate-spin 1s linear infinite;"></div>
    <p style="margin: 10px 0 0; color: #666;">正在翻译...</p>
  `;
  
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes llm-translate-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  translationPopup.appendChild(loader);
  document.body.appendChild(translationPopup);
  
  // 点击页面其他位置关闭弹窗
  document.addEventListener('mousedown', function closePopup(e) {
    // 检查translationPopup是否存在，因为它可能已被移除
    if (!translationPopup) {
      document.removeEventListener('mousedown', closePopup);
      return;
    }
    
    if (e.target !== translationPopup && !translationPopup.contains(e.target)) {
      if (document.body.contains(translationPopup)) {
        console.log('关闭翻译弹窗');
        document.body.removeChild(translationPopup);
        translationPopup = null;
      }
      document.removeEventListener('mousedown', closePopup);
    }
  });
}

// 处理翻译结果
function handleTranslation(originalText, translatedText) {
  // 确保参数有效，避免后续的substring操作失败
  originalText = originalText || '';
  translatedText = translatedText || '';
  
  console.log('处理翻译结果, 原文:', originalText.substring(0, 50) + (originalText.length > 50 ? '...' : ''));
  console.log('翻译结果:', translatedText.substring(0, 50) + (translatedText.length > 50 ? '...' : ''));
  
  // 如果弹窗不存在，尝试创建一个新的弹窗
  if (!translationPopup || !document.body.contains(translationPopup)) {
    console.warn('翻译弹窗不存在或已被移除，无法更新内容');
    return;
  }
  
  console.log('更新弹窗内容');
  // 清空原有内容
  translationPopup.innerHTML = '';
  
  // 原文
  const original = document.createElement('div');
  original.className = 'llm-original-text';
  original.style.fontSize = '14px';
  original.style.color = '#666';
  original.style.marginBottom = '8px';
  original.style.borderBottom = '1px solid #eee';
  original.style.paddingBottom = '8px';
  
  // 截断过长的原文
  if (originalText.length > 100) {
    original.textContent = originalText.substring(0, 100) + '...';
  } else {
    original.textContent = originalText;
  }
  
  // 翻译结果
  const result = document.createElement('div');
  result.className = 'llm-translated-text';
  result.style.fontSize = '14px';
  result.style.color = '#333';
  result.style.marginBottom = '10px';
  result.textContent = translatedText;
  
  // 控制按钮容器
  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.justifyContent = 'space-between';
  controls.style.marginTop = '10px';
  
  // 复制按钮
  const copyBtn = document.createElement('button');
  copyBtn.textContent = '复制结果';
  copyBtn.style.backgroundColor = '#f0f0f0';
  copyBtn.style.border = 'none';
  copyBtn.style.padding = '5px 10px';
  copyBtn.style.borderRadius = '4px';
  copyBtn.style.cursor = 'pointer';
  copyBtn.onclick = function() {
    console.log('复制翻译结果');
    navigator.clipboard.writeText(translatedText)
      .then(() => {
        copyBtn.textContent = '已复制';
        setTimeout(() => {
          copyBtn.textContent = '复制结果';
        }, 1500);
      });
  };
  
  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.backgroundColor = '#f0f0f0';
  closeBtn.style.border = 'none';
  closeBtn.style.padding = '5px 10px';
  closeBtn.style.borderRadius = '4px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.onclick = function() {
    console.log('关闭翻译弹窗');
    document.body.removeChild(translationPopup);
    translationPopup = null;
  };
  
  controls.appendChild(copyBtn);
  controls.appendChild(closeBtn);
  
  // 添加到弹窗
  translationPopup.appendChild(original);
  translationPopup.appendChild(result);
  translationPopup.appendChild(controls);
} 