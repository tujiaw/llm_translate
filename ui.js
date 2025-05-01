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
   * @param {number} width - 元素最大宽度
   * @param {number} height - 元素最大高度
   * @param {number} offset - 垂直偏移量
   * @returns {Object} 计算后的位置 {x, y}
   */
  static calculatePosition(x, y, width, height, offset = 20) {
    // 获取窗口尺寸
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    
    // 对宽高进行合理估算
    // 如果宽度超过窗口宽度的75%，则限制为窗口宽度的75%
    const estimatedWidth = Math.min(width, windowWidth * 0.75);
    // 如果高度超过窗口高度的75%，则限制为窗口高度的75%
    const estimatedHeight = Math.min(height, windowHeight * 0.75);
    
    // 初始位置计算 - 优先在点击/选择位置的右下方
    let posX = x;
    let posY = y + offset; // 默认在选中文本下方offset像素
    
    // 考虑四个可能的放置位置: 右下、左下、右上、左上
    // 计算每个位置的可用空间
    const spaceRight = windowWidth - x;
    const spaceLeft = x;
    const spaceBelow = windowHeight - y;
    const spaceAbove = y;
    
    // 根据可用空间决定水平位置
    if (spaceRight >= estimatedWidth) {
      // 右侧有足够空间
      posX = x;
    } else if (spaceLeft >= estimatedWidth) {
      // 左侧有足够空间
      posX = x - estimatedWidth;
    } else {
      // 两侧都没有足够空间，居中显示，但确保不超出屏幕
      posX = Math.max(5, Math.min(windowWidth - estimatedWidth - 5, 
                    (windowWidth - estimatedWidth) / 2));
    }
    
    // 根据可用空间决定垂直位置
    if (spaceBelow >= estimatedHeight) {
      // 下方有足够空间
      posY = y + offset;
    } else if (spaceAbove >= estimatedHeight) {
      // 上方有足够空间
      posY = y - estimatedHeight - offset;
    } else {
      // 上下都没有足够空间，居中显示，但确保不超出屏幕
      posY = Math.max(5, Math.min(windowHeight - estimatedHeight - 5, 
                    (windowHeight - estimatedHeight) / 2));
    }
    
    // 最后的边界检查
    // 确保不会超出右边界
    if (posX + estimatedWidth > windowWidth) {
      posX = windowWidth - estimatedWidth - 5;
    }
    
    // 确保不会超出左边界
    if (posX < 5) {
      posX = 5;
    }
    
    // 确保不会超出下边界
    if (posY + estimatedHeight > windowHeight) {
      posY = windowHeight - estimatedHeight - 5;
    }
    
    // 确保不会超出上边界
    if (posY < 5) {
      posY = 5;
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
    
    // 按钮实际尺寸 (根据内容调整)
    const buttonWidth = 32; // 图标宽度 + padding
    const buttonHeight = 32; // 图标高度 + padding
    
    // 计算最佳位置 - 使用按钮的实际尺寸
    const position = UiService.calculatePosition(x, y, buttonWidth, buttonHeight);
    
    // 设置位置
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    
    // 将要翻译的文本保存在按钮的数据属性中
    button.dataset.textToTranslate = textToTranslate;
    
    // 点击事件
    button.onclick = function(e) {
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
    
    // 近似估计弹窗内容的初始尺寸
    const initialWidth = 250;  // 预计的宽度
    const initialHeight = 100; // 预计的高度
    
    // 计算最佳位置，使用估计的尺寸
    const position = UiService.calculatePosition(x, y, initialWidth, initialHeight);
    
    // 设置位置
    popup.style.left = `${position.x}px`;
    popup.style.top = `${position.y}px`;
    
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
    
    // 存储当前位置
    const currentLeft = parseInt(popup.style.left);
    const currentTop = parseInt(popup.style.top);
    
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
    
    // 为新内容重新计算位置
    // 等待DOM更新完成后获取实际尺寸
    setTimeout(() => {
      const rect = popup.getBoundingClientRect();
      const estimatedWidth = rect.width;
      const estimatedHeight = rect.height;
      
      // 使用原位置坐标重新计算最佳位置
      const position = UiService.calculatePosition(
        currentLeft, currentTop - 20, // 减去偏移量以获取原始触发点
        estimatedWidth, estimatedHeight
      );
      
      // 应用新位置
      popup.style.left = `${position.x}px`;
      popup.style.top = `${position.y}px`;
    }, 0);
    
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
    
    // 存储当前位置
    const currentLeft = parseInt(popup.style.left);
    const currentTop = parseInt(popup.style.top);
    
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
    
    // 为新内容重新计算位置
    // 等待DOM更新完成后获取实际尺寸
    setTimeout(() => {
      const rect = popup.getBoundingClientRect();
      const estimatedWidth = rect.width;
      const estimatedHeight = rect.height;
      
      // 使用原位置坐标重新计算最佳位置
      const position = UiService.calculatePosition(
        currentLeft, currentTop - 20, // 减去偏移量以获取原始触发点
        estimatedWidth, estimatedHeight
      );
      
      // 应用新位置
      popup.style.left = `${position.x}px`;
      popup.style.top = `${position.y}px`;
    }, 0);
    
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