// ui.js - UI组件和交互管理

/**
 * UI服务类 - 处理界面元素的创建和管理
 */
class UiService {
  static safeRemoveTranslateButton() {
    const existingButton = document.querySelector('.llm-translate-button');
    if (existingButton && document.body.contains(existingButton)) {
      document.body.removeChild(existingButton);
    }
  }

  /**
   * 计算元素在屏幕上的最佳位置
   * @param {number} x - 初始X坐标
   * @param {number} y - 初始Y坐标
   * @param {number} width - 元素宽度
   * @param {number} height - 元素高度
   * @param {number} offset - 垂直偏移量
   * @returns {Object} 计算后的位置 {x, y}
   */
  static calculatePosition(x, y, width, height, offset = 20) {
    // 获取窗口尺寸
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    
    // 初始位置计算
    let posX = x;
    let posY = y + offset; // 默认在选中文本下方offset像素
    
    // 确保元素在屏幕内 - 水平方向
    if (posX + width > windowWidth) {
      posX = windowWidth - width - 5;
    }
    
    // 确保元素不会太靠左
    if (posX < 5) {
      posX = 5;
    }
    
    // 确保元素在屏幕内 - 垂直方向
    if (posY + height > windowHeight) {
      // 如果下方放不下，尝试放在上方
      posY = y - height - 5;
      
      // 如果上方也放不下，就放在靠近底部但仍在屏幕内的位置
      if (posY < 5) {
        posY = windowHeight - height - 5;
      }
    }
    
    return { x: posX, y: posY };
  }

  /**
   * 创建翻译按钮
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {string} textToTranslate - 要翻译的文本
   * @param {Function} onTranslate - 点击翻译按钮的回调
   * @returns {HTMLElement} 创建的按钮元素
   */
  static createTranslateButton(x, y, textToTranslate, onTranslate) {
    // 检查是否已经存在翻译按钮，如果有则移除
    UiService.safeRemoveTranslateButton();
    
    const button = document.createElement('div');
    button.className = 'llm-translate-button';
    
    // 使用图标替代文本
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('images/icon16.png');
    img.alt = '翻译';
    img.style.width = '16px';
    img.style.height = '16px';
    button.appendChild(img);
    
    // 估计按钮尺寸
    const buttonRect = {width: 60, height: 30}; 
    
    // 计算最佳位置
    const position = UiService.calculatePosition(x, y, buttonRect.width, buttonRect.height);
    
    // 设置位置
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    
    // 将要翻译的文本保存在按钮的数据属性中
    button.dataset.textToTranslate = textToTranslate;
    
    // 点击事件
    button.onclick = function(e) {
      console.log("4")
      e.stopPropagation();
      const text = this.dataset.textToTranslate;
      
      // 从DOM中移除按钮
      if (document.body.contains(button)) {
        document.body.removeChild(button);
      }
      
      // 调用传入的回调函数 - 使用计算后的位置
      if (typeof onTranslate === 'function') {
        onTranslate(text, position.x, position.y);
      }
    };
    
    document.body.appendChild(button);
    
    // 点击页面其他位置移除按钮
    
    return button;
  }

  /**
   * 创建并显示加载中的弹窗
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @returns {HTMLElement} 创建的弹窗元素
   */
  static createLoadingPopup(x, y) {
    const popup = document.createElement('div');
    popup.className = 'llm-translation-popup';
    
    // 弹窗样式
    popup.style.position = 'absolute';
    popup.style.zIndex = '10000';
    popup.style.backgroundColor = 'white';
    popup.style.padding = '15px'; 

    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    popup.style.minWidth = '200px';
    popup.style.maxWidth = '400px';
    
    // 估计弹窗尺寸 (需要考虑内容可能很长)
    const popupWidth = 400; // maxWidth
    const popupHeight = 200; // 估计高度
    
    // 计算最佳位置
    const position = UiService.calculatePosition(x, y, popupWidth, popupHeight);
    
    // 设置位置
    popup.style.left = `${position.x}px`;
    popup.style.top = `${position.y}px`;
    
    // 加载指示器
    const loader = document.createElement('div');
    loader.style.padding = '10px';
    loader.innerHTML = `
      <div style="display: flex; justify-content: center;"><div style="width: 20px; height: 20px; border: 3px solid rgba(0,0,0,0.1); border-radius: 50%; border-top: 3px solid #4CAF50; animation: llm-translate-spin 1s linear infinite;"></div></div>
      <p style="margin: 10px 0 0; color: #666; text-align: center;">正在翻译...</p>
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
    
    popup.appendChild(loader);
    
    document.body.appendChild(popup);
    return popup;
  }

  /**
   * 复制文本到剪贴板
   * @param {string} text - 要复制的文本
   * @returns {Promise<void>}
   */
  static async copyToClipboard(text) {
    try {
      // 先尝试使用现代API
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy using modern API:', err);
      // 如果现代API失败，尝试使用旧的API
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (!successful) {
          throw new Error('Copy failed');
        }
      } catch (fallbackErr) {
        console.error('Failed to copy using fallback method:', fallbackErr);
        throw fallbackErr;
      }
    }
  }

  /**
   * 更新弹窗内容，显示翻译结果
   * @param {HTMLElement} popup - 弹窗元素
   * @param {string} originalText - 原文文本
   * @param {string} translatedText - 翻译后的文本
   */
  static async updatePopupWithTranslation(popup, originalText, translatedText) {
    if (!popup || !document.body.contains(popup)) {
      return null;
    }
    
    // 清空原有内容
    popup.innerHTML = '';
    
    // 原文
    const original = document.createElement('div');
    original.className = 'llm-original-text';
    original.style.fontSize = '14px';
    original.style.color = '#666';
    original.style.marginBottom = '8px';
    original.style.borderBottom = '1px solid #eee';
    original.style.paddingBottom = '8px';
    original.style.textAlign = 'left';
    
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
    result.style.textAlign = 'left';
    result.textContent = translatedText;
    
    // 添加到弹窗
    popup.appendChild(original);
    popup.appendChild(result);
    
    // 自动复制翻译结果到剪贴板
    try {
      await this.copyToClipboard(translatedText);
    } catch (error) {
      console.error('Failed to copy translation to clipboard:', error);
    }
    
    return popup;
  }
  
  /**
   * 显示错误信息
   * @param {HTMLElement} popup - 弹窗元素
   * @param {string} originalText - 原文文本
   * @param {string} errorMessage - 错误信息
   */
  static showError(popup, originalText, errorMessage) {
    if (!popup || !document.body.contains(popup)) {
      return null;
    }
    
    // 清空原有内容
    popup.innerHTML = '';
    
    // 原文
    const original = document.createElement('div');
    original.className = 'llm-original-text';
    original.style.fontSize = '14px';
    original.style.color = '#666';
    original.style.marginBottom = '8px';
    original.style.borderBottom = '1px solid #eee';
    original.style.paddingBottom = '8px';
    original.style.textAlign = 'left';
    
    // 截断过长的原文
    if (originalText.length > 100) {
      original.textContent = originalText.substring(0, 100) + '...';
    } else {
      original.textContent = originalText;
    }
    
    // 错误信息
    const result = document.createElement('div');
    result.className = 'llm-error-text';
    result.style.fontSize = '14px';
    result.style.color = '#d32f2f';
    result.style.marginBottom = '10px';
    result.style.textAlign = 'left';
    result.textContent = errorMessage;
    
    // 添加到弹窗
    popup.appendChild(original);
    popup.appendChild(result);
    
    return popup;
  }

  /**
   * 显示告警信息
   * @param {string} message - 显示的消息
   * @param {string} type - 消息类型 (success, error, warning, info)
   * @param {number} duration - 显示时长(毫秒)
   */
  static showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `llm-notification llm-notification-${type}`;
    notification.textContent = message;
    
    // 设置样式
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '10px 15px';
    notification.style.borderRadius = '4px';
    notification.style.color = 'white';
    notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    notification.style.zIndex = '10001';
    notification.style.maxWidth = '300px';
    notification.style.wordWrap = 'break-word';
    
    // 根据类型设置背景色
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#4CAF50';
        break;
      case 'error':
        notification.style.backgroundColor = '#f44336';
        break;
      case 'warning':
        notification.style.backgroundColor = '#ff9800';
        break;
      case 'info':
      default:
        notification.style.backgroundColor = '#2196F3';
        break;
    }
    
    document.body.appendChild(notification);
    
    // 自动关闭
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, duration);
    
    return notification;
  }
}

// 导出UI服务
export default UiService; 