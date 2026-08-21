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
   * 创建翻译按钮
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {string} textToTranslate - 要翻译的文本
   * @param {Function} onTranslate - 点击翻译按钮的回调
   * @returns {HTMLElement} 创建的按钮元素
   */
  static createTranslateButton(x, y, textToTranslate, onTranslate) {
    UiService.safeRemoveTranslateButton();

    const button = document.createElement('div');
    button.className = 'llm-translate-button';
    button.dataset.ningto20170704 = '';
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;

    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('images/icon16.png');
    img.alt = '翻译';
    button.appendChild(img);

    button.dataset.textToTranslate = textToTranslate;
    button.onclick = function(e) {
      e.stopPropagation();
      const text = this.dataset.textToTranslate;
      if (document.body.contains(button)) {
        document.body.removeChild(button);
      }
      if (typeof onTranslate === 'function') {
        onTranslate(text, x, y);
      }
    };

    document.body.appendChild(button);
    return button;
  }

  static truncatePreview(text, maxLength = 100) {
    const value = text || '';
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...`;
  }

  static addPopupCloseButton(popup) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'llm-popup-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    });
    popup.appendChild(closeBtn);
  }

  static addPopupCopyButton(popup, text) {
    const actions = document.createElement('div');
    actions.className = 'llm-popup-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'llm-popup-action';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        await UiService.copyToClipboard(text);
        copyBtn.textContent = '已复制';
        setTimeout(() => {
          copyBtn.textContent = '复制';
        }, 1200);
      } catch (error) {
        console.error('复制失败:', error);
        copyBtn.textContent = '复制失败';
      }
    });

    actions.appendChild(copyBtn);
    popup.appendChild(actions);
  }

  static createLoadingPopup(x, y) {
    const popup = document.createElement('div');
    popup.className = 'llm-translation-popup';
    popup.dataset.ningto20170704 = '';
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;

    const loader = document.createElement('div');
    loader.className = 'llm-popup-loader';
    loader.innerHTML = `
      <div class="llm-popup-spinner"></div>
      <p class="llm-popup-loading-text">正在翻译…</p>
    `;
    popup.appendChild(loader);
    UiService.addPopupCloseButton(popup);
    document.body.appendChild(popup);
    UiService.makePopupDraggable(popup);
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
        textarea.dataset.ningto20170704 = '';
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

    popup.innerHTML = '';

    const original = document.createElement('div');
    original.className = 'llm-original-text';
    original.textContent = UiService.truncatePreview(originalText);

    const result = document.createElement('div');
    result.className = 'llm-translated-text';
    result.textContent = translatedText;

    popup.appendChild(original);
    popup.appendChild(result);
    UiService.addPopupCopyButton(popup, translatedText);
    UiService.addPopupCloseButton(popup);
    UiService.makePopupDraggable(popup);
    return popup;
  }

  static showError(popup, originalText, errorMessage) {
    if (!popup || !document.body.contains(popup)) {
      return null;
    }

    popup.innerHTML = '';

    const original = document.createElement('div');
    original.className = 'llm-original-text';
    original.textContent = UiService.truncatePreview(originalText);

    const result = document.createElement('div');
    result.className = 'llm-error-text';
    result.textContent = errorMessage;

    popup.appendChild(original);
    popup.appendChild(result);
    UiService.addPopupCloseButton(popup);
    UiService.makePopupDraggable(popup);
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
    notification.dataset.ningto20170704 = '';
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

  /**
   * 使弹窗可拖拽（在弹窗顶部中间添加40*25的拖动区域）
   * @param {HTMLElement} popup - 弹窗元素
   */
  static makePopupDraggable(popup) {
    if (!popup) {
      return;
    }

    // 如果已经存在拖拽区域，直接返回，避免重复添加
    if (popup.querySelector('.llm-drag-area')) {
      return;
    }

    // 创建拖动区域
    const dragArea = document.createElement('div');
    dragArea.className = 'llm-drag-area';

    // 基础样式：位置在顶部中间，大小40*25，鼠标样式为move
    dragArea.textContent = '⋯';
    dragArea.style.position = 'absolute';
    dragArea.style.top = '0';
    dragArea.style.left = '50%';
    dragArea.style.transform = 'translateX(-50%)';
    dragArea.style.width = '40px';
    dragArea.style.height = '25px';
    dragArea.style.cursor = 'move';
    dragArea.style.userSelect = 'none';
    // 可选：给一个轻微透明背景，方便用户看到拖动区域
    dragArea.style.backgroundColor = 'rgba(0,0,0,0)';

    // 文本水平居中，垂直顶部对齐
    dragArea.style.display = 'flex';
    dragArea.style.justifyContent = 'center'; // 水平居中
    dragArea.style.alignItems = 'flex-start'; // 垂直顶部

    // 将拖动区域插入到弹窗中（置于最上层）
    popup.appendChild(dragArea);

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    // 统一获取包含滚动偏移的页内坐标
    const getPageX = (evt) => evt.pageX || (evt.clientX + window.scrollX);
    const getPageY = (evt) => evt.pageY || (evt.clientY + window.scrollY);

    const onMouseMove = (e) => {
      if (!isDragging) return;
      popup.style.left = `${getPageX(e) - offsetX}px`;
      popup.style.top = `${getPageY(e) - offsetY}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    dragArea.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 仅响应左键
      isDragging = true;
      // 记录指针到弹窗左上角的偏移，使用包含滚动值的坐标，避免页面有滚动时产生跳动
      offsetX = getPageX(e) - popup.offsetLeft;
      offsetY = getPageY(e) - popup.offsetTop;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}

// 导出UI服务
export default UiService; 