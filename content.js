// 全局变量
let selectedText = '';
let translationPopup = null;

// 监听消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "getSelectedText") {
    sendResponse({selectedText: selectedText});
  } else if (request.action === "translate") {
    handleTranslation(request.text, request.result);
  }
  return true;
});

// 监听文本选择
document.addEventListener('mouseup', function(event) {
  selectedText = window.getSelection().toString().trim();
  
  // 检查是否存在翻译弹窗，如果有则移除
  if (translationPopup) {
    document.body.removeChild(translationPopup);
    translationPopup = null;
  }
  
  // 如果有选中的文本，创建快速翻译按钮
  if (selectedText.length > 0) {
    const x = event.pageX;
    const y = event.pageY;
    createTranslateButton(x, y);
  }
});

// 创建快速翻译按钮
function createTranslateButton(x, y) {
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
  
  // 鼠标悬停效果
  button.onmouseover = function() {
    this.style.backgroundColor = '#45a049';
  };
  button.onmouseout = function() {
    this.style.backgroundColor = '#4CAF50';
  };
  
  // 点击事件
  button.onclick = function(e) {
    e.stopPropagation();
    // 移除按钮
    document.body.removeChild(button);
    
    // 通知后台脚本进行翻译
    chrome.runtime.sendMessage({
      action: "performTranslation",
      text: selectedText
    });
    
    // 显示加载中的弹窗
    showLoadingPopup(x, y);
  };
  
  document.body.appendChild(button);
  
  // 点击页面其他位置移除按钮
  document.addEventListener('mousedown', function removeButton(e) {
    if (e.target !== button) {
      if (document.body.contains(button)) {
        document.body.removeChild(button);
      }
      document.removeEventListener('mousedown', removeButton);
    }
  });
}

// 显示加载中的弹窗
function showLoadingPopup(x, y) {
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
    if (e.target !== translationPopup && !translationPopup.contains(e.target)) {
      if (document.body.contains(translationPopup)) {
        document.body.removeChild(translationPopup);
        translationPopup = null;
      }
      document.removeEventListener('mousedown', closePopup);
    }
  });
}

// 处理翻译结果
function handleTranslation(originalText, translatedText) {
  // 如果弹窗存在，更新内容
  if (translationPopup && document.body.contains(translationPopup)) {
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
} 