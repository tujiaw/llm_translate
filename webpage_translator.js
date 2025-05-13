// webpage_translator.js - 全网页翻译模块

// 导入所需模块
import Utils from './utils.js';

/**
 * 网页翻译服务类 - 提供全网页翻译功能
 */
class WebpageTranslatorService {
  /**
   * 获取页面中所有可翻译的文本节点
   * @returns {Array<{node: Node, text: string, id: string}>} 可翻译节点数组
   */
  static getTranslatableNodes() {
    const excludeTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'META', 'TITLE', 'LINK'];
    const excludeClasses = ['llm-translation-label', 'llm-translate-button', 'llm-translation-popup'];
    // 代码相关的类名
    const codeClasses = [
      'codeblock', 'hljs', 'prism', 'prettyprint', 'sourceCode', 
      'codehilite', 'wp-block-code', 'brush:', 'sh_',
      'CodeMirror', 'monaco-editor', 'ace_editor', 'syntaxhighlighter', 'SyntaxHighlighter'
    ];
    
    // 代码容器的标识符
    const codeContainers = ['PRE', 'CODE', 'SAMP', 'KBD'];
    const translateNodes = [];
    
    // 遍历文档中的所有文本节点
    const walker = document.createTreeWalker(
      document.body,
      
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentElement;
          
          // 排除特定标签和类
          if (!parent || 
              excludeTags.includes(parent.tagName) || 
              excludeClasses.some(cls => parent.classList.contains(cls))) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 排除空文本或只有空格的文本
          const text = node.textContent.trim();
          if (!text || text.length < 2) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 排除已翻译的节点
          if (parent.querySelector('.llm-translation-label')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 排除代码块
          // 1. 检查是否在<pre>、<code>等代码容器标签内
          let ancestor = parent;
          while (ancestor) {
            if (codeContainers.includes(ancestor.nodeName)) {
              return NodeFilter.FILTER_REJECT;
            }
            
            // 2. 检查是否有代码相关类名
            if (ancestor.classList) {
              for (const cls of codeClasses) {
                if (Array.from(ancestor.classList).some(className => className.includes(cls))) {
                  return NodeFilter.FILTER_REJECT;
                }
              }
            }
            
            // 3. 检查自定义data属性表示代码
            if (ancestor.dataset && 
               (ancestor.dataset.code != null || 
                ancestor.dataset.language != null || 
                ancestor.dataset.syntax != null)) {
              return NodeFilter.FILTER_REJECT;
            }
            
            ancestor = ancestor.parentElement;
          }
          
          // 4. 检查文本是否像代码（基于启发式规则）
          if (isProbablyCode(text)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    /**
     * 基于启发式规则判断文本是否可能是代码
     * @param {string} text - 要检查的文本
     * @returns {boolean} 是否可能是代码
     */
    function isProbablyCode(text) {
      // 如果文本很短但明显是自然语言，跳过代码检测
      const naturalLanguagePhrases = [
        /^(Note|Warning|Caution|Important|Info|Tip):/i,
        /^(Step|Chapter|Section)\s+\d+/i,
        /^(Figure|Table|Chart)\s+\d+/i,
        /^(See|Read)\s+(also|more):/i
      ];
      
      if (naturalLanguagePhrases.some(pattern => pattern.test(text))) {
        return false;
      }
      
      // 如果文本很短且包含特定符号，可能是行内代码
      if (text.length < 50) {
        // 检查是否被反引号包围（Markdown行内代码）
        if (/^`[^`]+`$/.test(text)) {
          return true;
        }
        
        // 检查是否是shell命令
        if (/^\s*[$#>]\s+[\w./-]+/.test(text)) {
          return true;
        }
      }
      
      // 如果文本包含markdown代码块标记，则认为是代码
      if (/^```[a-z]*\s*$/im.test(text) || /^~~~[a-z]*\s*$/im.test(text)) {
        return true;
      }
      
      // 常见代码特征
      const codePatterns = [
        // 函数定义/调用
        /function\s+\w+\s*\(/i,
        // 变量声明
        /(var|let|const)\s+\w+\s*=/i,
        // 类定义
        /class\s+\w+(\s+extends\s+\w+)?\s*\{/i,
        // 常见编程语言关键字组合
        /(if|for|while|switch|return|case)\s*\([^)]*\)/i,
        // HTML标签
        /<\/?[a-z][a-z0-9]*(?:\s+[a-z0-9-]+(?:=(?:"[^"]*"|'[^']*'|[^>\s]+))?)*\s*\/?>/i,
        // CSS规则
        /[\.\#]?[a-z0-9_-]+\s*\{[^}]*\}/i,
        // JSON格式或对象字面量
        /\{\s*"[^"]+"\s*:\s*["0-9\[\{]/i,
        // 常见代码缩进模式
        /^(\s{2,}|\t+)[a-z0-9_$.]+/im,
        // 编程语言特有符号组合
        /[;{}]\s*(\/\/.*)?$/m,
        // Import/Export语句
        /(import|export)(\s+\{[^}]+\}\s+from|\s+[a-z0-9_$]+\s+from)/i,
        // 命令行提示符
        /^\s*[#$>]\s+\w+/m,
        // 多行赋值
        /[a-z0-9_$]+\s*=\s*[a-z0-9_$]+/i,
        // 常见编程语言注释
        /\/\/\s*.*$|\/\*[\s\S]*?\*\/|#\s.*$/m,
        // API路径或URL参数
        /\/api\/v[0-9]+\/[a-z0-9\/]+(\?[\w%&=]+)?/i,
        // 常见的编程语言语法
        /\w+\s*\.\s*\w+\s*\(\s*.*\s*\)/,
        // SQL查询片段
        /SELECT\s+.+\s+FROM\s+.+/i
      ];
      
      // 检查是否包含代码模式
      const codePatternMatches = codePatterns.filter(pattern => pattern.test(text)).length;
      // 对较短文本，只需匹配一个模式即可
      if (text.length < 100 && codePatternMatches >= 1) {
        return true;
      }
      // 对较长文本，需要匹配更多模式
      if (codePatternMatches >= 2) {
        return true;
      }
      
      // 检查特殊符号比例
      const codeSymbols = text.match(/[{}\[\]()<>:;=!+\-*/%&|^~?]|\.\.\./g) || [];
      const textLength = text.length;
      const symbolRatio = codeSymbols.length / textLength;
      
      // 调整特殊符号比例阈值，根据文本长度
      if (textLength < 30) {
        return symbolRatio > 0.15;
      }
      
      return symbolRatio > 0.1;  // 如果特殊符号比例过高，可能是代码
    }
    
    // 收集符合条件的节点
    let node;
    let nodeIndex = 0;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text) {
        // 为每个节点生成简短的唯一ID
        const nodeId = `ningto${nodeIndex++}`;
        
        translateNodes.push({
          node: node,
          text: text,
          id: nodeId
        });
      }
    }
    
    return translateNodes;
  }
  
  /**
   * 批量翻译文本
   * @param {Array<{text: string, id: string}>} nodeItems - 要翻译的文本和ID数组
   * @param {object} config - 翻译配置
   * @returns {Promise<Array<{id: string, translation: string}>>} 翻译结果数组
   */
  static async batchTranslate(nodeItems, config) {
    if (!nodeItems || nodeItems.length === 0) {
      return [];
    }
    
    try {
      // 准备批量翻译提示
      const nativeLanguage = config.nativeLanguage || 'zh';
      const promptLanguage = Utils.getLanguageNameInEnglish(nativeLanguage);
      
      // 构建每行格式为 "ID:::原文" 的文本列表
      const formattedTexts = nodeItems.map(item => `${item.id}:::${item.text}`);
      
      // 构建批量翻译提示
      const systemPrompt = `You are a translation assistant. Please translate the following list of texts into ${promptLanguage}. 
Each line has a format of "ID:::Text". Preserve the exact ID and translate only the text part.
Your response must follow the same format of "ID:::Translated Text" and have exactly the same number of lines as the input.
Do not add any explanation or additional content.`;
      
      // 获取当前选择的模型信息
      let modelInfo;
      if (config.currentModel === 'custom' && config.customModel && config.customModel.enabled) {
        modelInfo = config.customModel;
      } else if (config.modelDefinitions && config.modelDefinitions[config.currentModel]) {
        modelInfo = config.modelDefinitions[config.currentModel];
      } else {
        throw new Error(`Model information not found: ${config.currentModel || 'Model not specified'}`);
      }
      
      // 构建查询文本 - 文本列表，每行一条
      const queryText = formattedTexts.join('\n');
      
      // 构建API请求
      const apiEndpoint = modelInfo.apiEndpoint;
      const modelType = modelInfo.type;
      const modelName = modelInfo.name;
      const modelProvider = modelInfo.provider || modelType;

      console.log(`Preparing batch translation request: model=${modelName}, type=${modelType}, provider=${modelProvider}`);
      
      let requestBody;
      switch (modelType) {
        case 'silicon-flow':
        case 'zhipu':
        case 'gpt':
          requestBody = {
            model: modelName,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: queryText }
            ],
            temperature: 0.3
          };
          break;
          
        case 'claude':
          requestBody = {
            model: modelName,
            system: systemPrompt,
            messages: [
              { role: "user", content: queryText }
            ],
            max_tokens: 4000
          };
          break;
          
        case 'gemini':
          requestBody = {
            contents: [
              {
                role: "user",
                parts: [{ text: systemPrompt + "\n\n" + queryText }]
              }
            ],
            generationConfig: {
              temperature: 0.2
            }
          };
          break;
          
        case 'custom':
          requestBody = {
            model: modelName || 'default',
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: queryText }
            ]
          };
          break;
          
        default:
          throw new Error(`不支持的模型类型: ${modelType}`);
      }
      
      // 获取API密钥
      const apiKey = config.apiKeys && config.apiKeys[modelProvider];
      if (!apiKey && modelInfo.requiresKey !== false) {
        const errorMessage = `模型 ${modelName} 需要API密钥，但未提供。请在扩展的设置页面中配置 ${modelProvider} 的API密钥。`;
        console.error(errorMessage);
        this.showTranslationComplete(errorMessage, true);
        return nodeItems.map(item => ({ 
          id: item.id, 
          translation: `[Please configure ${modelProvider} API key in settings]` 
        }));
      }
      
      // 设置API选项
      const apiOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      };
      
      // 根据提供商添加认证头
      if (apiKey) {
        console.log(`Adding authentication header for ${modelProvider}`);
        switch (modelProvider) {
          case 'openai':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'anthropic':
            apiOptions.headers['x-api-key'] = apiKey;
            apiOptions.headers['anthropic-version'] = '2023-06-01';
            break;
          case 'google':
            apiOptions.headers['x-goog-api-key'] = apiKey;
            break;
          case 'zhipu':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'moonshot':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'baichuan':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'minimax':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'stability':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'cloudflare':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'together':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'groq':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'deepseek':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          case 'silicon-flow':
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
            break;
          default:
            apiOptions.headers['Authorization'] = `Bearer ${apiKey}`;
        }
      } else {
        console.log(`No API key configured, but model marked as not requiring key`);
      }
      
      // 发送API请求
      console.log(`Sending batch translation request to: ${apiEndpoint}`);
      const response = await fetch(apiEndpoint, apiOptions);
      
      if (!response.ok) {
        let errorMessage = '';
        try {
          const errorText = await response.text();
          errorMessage = `API请求失败 (${response.status}): ${errorText}`;
          
          // 针对常见错误提供更友好的提示
          if (response.status === 401) {
            let friendlyError = `Authentication failed: API key may be invalid or not properly configured. Please check ${modelProvider} API key in extension settings.`;
            console.error(friendlyError);
            this.showTranslationComplete(friendlyError, true);
            return nodeItems.map(item => ({ 
              id: item.id, 
              translation: `[API Authentication failed: Please check ${modelProvider} API key]` 
            }));
          } else if (response.status === 403) {
            let friendlyError = `Access denied: Your API key may not have permission to access this resource. Please ensure the API key is correct and valid.`;
            console.error(friendlyError);
            this.showTranslationComplete(friendlyError, true);
            return nodeItems.map(item => ({ 
              id: item.id, 
              translation: `[API Authentication failed: Please check ${modelProvider} API key]` 
            }));
          } else if (response.status === 429) {
            let friendlyError = `Too many requests: API call limit reached. Please try again later.`;
            console.error(friendlyError);
            this.showTranslationComplete(friendlyError, true);
            return nodeItems.map(item => ({ 
              id: item.id, 
              translation: `[API call limit reached]` 
            }));
          }
        } catch (e) {
          errorMessage = `API请求失败 (${response.status})`;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // 解析响应
      let translatedText;
      switch (modelType) {
        case 'silicon-flow':
        case 'zhipu':
        case 'gpt':
          translatedText = data.choices[0].message.content;
          break;
          
        case 'claude':
          translatedText = data.content[0].text;
          break;
          
        case 'gemini':
          translatedText = data.candidates[0].content.parts[0].text;
          break;
          
        case 'custom':
          // 自定义模型可能有不同的响应格式，尝试几种常见格式
          if (data.choices && data.choices[0] && data.choices[0].message) {
            translatedText = data.choices[0].message.content;
          } else if (data.content && data.content[0]) {
            translatedText = data.content[0].text;
          } else if (data.response) {
            translatedText = data.response;
          } else {
            // 如果无法确定具体格式，尝试JSON.stringify整个响应作为备用
            translatedText = JSON.stringify(data);
          }
          break;
          
        default:
          throw new Error(`不支持的模型类型: ${modelType}`);
      }
      
      // 将翻译结果拆分为数组
      const translatedLines = translatedText.trim().split('\n');
      
      // 解析结果为ID和翻译文本对象
      const translationResults = [];
      
      for (const line of translatedLines) {
        const parts = line.split(':::');
        if (parts.length >= 2) {
          const id = parts[0].trim();
          // 合并后面所有部分作为翻译内容（防止原文中包含:::）
          const translation = parts.slice(1).join(':::').trim();
          translationResults.push({ id, translation });
        } else {
          console.warn('Cannot parse translation line:', line);
        }
      }
      
      // 确保所有条目都有翻译结果
      const allNodeIds = new Set(nodeItems.map(item => item.id));
      const translatedIds = new Set(translationResults.map(item => item.id));
      
      // 添加缺失的翻译
      for (const nodeItem of nodeItems) {
        if (!translatedIds.has(nodeItem.id)) {
          console.warn(`Translation not found for ID ${nodeItem.id}, using placeholder`);
          translationResults.push({
            id: nodeItem.id,
            translation: '[Translation Error]'
          });
        }
      }
      
      return translationResults;
    } catch (error) {
      console.error('Batch translation error:', error);
      // 返回错误信息数组
      return nodeItems.map(item => ({
        id: item.id,
        translation: `[Translation Error: ${error.message}]`
      }));
    }
  }
  
  /**
   * 在网页中显示翻译结果
   * @param {Array<{node: Node, text: string, id: string}>} nodes - 节点信息数组 
   * @param {Array<{id: string, translation: string}>} translations - 翻译结果数组
   */
  static displayTranslations(nodes, translations) {
    if (!nodes || !translations) {
      console.error('节点数组或翻译数组为空', nodes?.length, translations?.length);
      return;
    }
    
    // 创建ID到翻译的映射
    const translationMap = new Map();
    for (const translationItem of translations) {
      translationMap.set(translationItem.id, translationItem.translation);
    }
    
    // 遍历所有节点添加翻译
    for (const nodeInfo of nodes) {
      const translation = translationMap.get(nodeInfo.id);
      
      if (!translation) {
        console.warn(`Translation not found for ID ${nodeInfo.id}`);
        continue;
      }
      
      try {
        // 为原文本节点的父元素添加相对定位
        const parent = nodeInfo.node.parentElement;
        const originalPosition = window.getComputedStyle(parent).position;
        if (originalPosition === 'static') {
          parent.style.position = 'relative';
        }
        
        // 创建翻译标签
        const translationLabel = document.createElement('div');
        translationLabel.className = 'llm-translation-label';
        translationLabel.textContent = translation;
        translationLabel.dataset.translationId = nodeInfo.id; // 添加ID引用
        translationLabel.style.cssText = `
          color: #333;
          background-color: rgba(255, 255, 240, 0.95);
          font-size: 13px;
          line-height: 1.4;
          padding: 3px 5px;
          margin-top: 3px;
          border-left: 2px solid #4CAF50;
          font-family: Arial, sans-serif;
          word-wrap: break-word;
          z-index: 10000;
        `;
        
        // 插入到原文本之后
        parent.insertBefore(translationLabel, nodeInfo.node.nextSibling);
      } catch (error) {
        console.error('Error displaying translation:', error, nodeInfo);
      }
    }
  }
  
  /**
   * 根据节点在视口中的可见性排序
   * @param {Array<{node: Node, text: string, id: string}>} nodes - 节点数组
   * @returns {Array<{node: Node, text: string, id: string}>} 排序后的节点数组
   */
  static sortNodesByVisibility(nodes) {
    // 获取视口信息
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const scrollTop = window.scrollY;
    const scrollBottom = scrollTop + viewportHeight;
    
    // 计算每个节点的优先级
    return [...nodes].sort((a, b) => {
      const rectA = a.node.parentElement.getBoundingClientRect();
      const rectB = b.node.parentElement.getBoundingClientRect();
      
      // 检查是否在视口内
      const aInViewport = rectA.top < viewportHeight && rectA.bottom > 0 && 
                          rectA.left < viewportWidth && rectA.right > 0;
      const bInViewport = rectB.top < viewportHeight && rectB.bottom > 0 && 
                          rectB.left < viewportWidth && rectB.right > 0;
      
      // 首先按是否在视口内排序
      if (aInViewport && !bInViewport) return -1;
      if (!aInViewport && bInViewport) return 1;
      
      // 然后按与视口顶部的距离排序
      return Math.abs(rectA.top) - Math.abs(rectB.top);
    });
  }
  
  /**
   * 更新翻译进度提示
   * @param {number} current - 当前进度
   * @param {number} total - 总数量
   */
  static updateTranslationProgress(current, total) {
    let statusBox = document.getElementById('llm-translation-status');
    if (statusBox) {
      const percent = Math.round((current / total) * 100);
      statusBox.innerHTML = `
        <div style="display: flex; align-items: center;">
          <div style="width: 16px; height: 16px; border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; border-top: 2px solid #4CAF50; animation: llm-translate-spin 1s linear infinite; margin-right: 10px;"></div>
          <span>Translating webpage... ${percent}% (${current}/${total})</span>
        </div>
      `;
    }
  }
  
  /**
   * 加载配置
   * @returns {Promise<Object>} 配置对象
   */
  static async loadConfig() {
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getConfig' }, (response) => {
          // 处理没有响应的情况
          if (chrome.runtime.lastError) {
            console.error('Error getting configuration:', chrome.runtime.lastError);
            // 使用默认配置继续
            resolve({});
            return;
          }
          
          // 处理响应为空的情况
          if (!response) {
            console.warn('Configuration response is empty, using default configuration');
            resolve({});
            return;
          }
          
          // 正常情况
          resolve(response.config || {});
        });
      });
    } catch (configError) {
      console.error('Configuration exception:', configError);
      // 出现异常也使用默认配置继续
      return {};
    }
  }
  
  /**
   * 确保配置对象完整性
   * @param {object} config - 原始配置对象
   * @returns {object} 完整的配置对象
   */
  static ensureCompleteConfig(config) {
    // 确保配置对象存在
    config = config || {};
    
    // 设置默认值
    config.nativeLanguage = config.nativeLanguage || 'zh';
    config.currentModel = config.currentModel || 'glm-4-9b';
    
    // 确保API密钥对象存在
    config.apiKeys = config.apiKeys || {};
    
    // 确保模型定义存在
    if (!config.modelDefinitions || Object.keys(config.modelDefinitions).length === 0) {
      config.modelDefinitions = {
        'glm-4-9b': {
          name: 'GLM-4-9B',
          apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions',
          type: 'silicon-flow',
          provider: 'silicon-flow',
          requiresKey: true
        },
        'qwen-7b': {
          name: 'Qwen2.5-7B',
          apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions',
          type: 'silicon-flow',
          provider: 'silicon-flow',
          requiresKey: true
        },
        'glm-4-flash': {
          name: 'GLM-4-Flash',
          apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
          type: 'zhipu',
          provider: 'zhipu',
          requiresKey: true
        }
      };
    } else {
      // 确保每个模型定义都有provider字段
      for (const modelId in config.modelDefinitions) {
        const model = config.modelDefinitions[modelId];
        if (!model.provider) {
          // 根据type推断provider
          model.provider = model.type;
        }
      }
    }
    
    // 确保自定义模型配置存在
    if (config.currentModel === 'custom') {
      config.customModel = config.customModel || {
        enabled: true,
        name: 'Custom Model',
        apiEndpoint: '',
        type: 'custom',
        provider: 'custom',
        requiresKey: true
      };
    }
    
    return config;
  }
  
  /**
   * 显示翻译进行中提示
   */
  static showTranslationInProgress() {
    // 创建或更新状态提示框
    let statusBox = document.getElementById('llm-translation-status');
    if (!statusBox) {
      statusBox = document.createElement('div');
      statusBox.id = 'llm-translation-status';
      statusBox.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background-color: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 10px 15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10001;
        font-family: Arial, sans-serif;
        font-size: 14px;
        display: flex;
        align-items: center;
      `;
      document.body.appendChild(statusBox);
    }
    
    // 加载中动画
    statusBox.innerHTML = `
      <div style="width: 16px; height: 16px; border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; border-top: 2px solid #4CAF50; animation: llm-translate-spin 1s linear infinite; margin-right: 10px;"></div>
      <span>Translating webpage...</span>
    `;
    
    // 添加动画样式(如果尚未添加)
    if (!document.getElementById('llm-translate-style')) {
      const style = document.createElement('style');
      style.id = 'llm-translate-style';
      style.textContent = `
        @keyframes llm-translate-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .llm-translation-label {
          transition: background-color 0.3s ease;
        }
        .llm-translation-label:hover {
          background-color: rgba(255, 255, 200, 0.98) !important;
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  /**
   * 显示翻译完成提示
   * @param {string} message - 提示消息
   * @param {boolean} isError - 是否为错误消息
   */
  static showTranslationComplete(message, isError = false) {
    let statusBox = document.getElementById('llm-translation-status');
    if (!statusBox) {
      statusBox = document.createElement('div');
      statusBox.id = 'llm-translation-status';
      statusBox.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background-color: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 10px 15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10001;
        font-family: Arial, sans-serif;
        font-size: 14px;
      `;
      document.body.appendChild(statusBox);
    }
    
    // 显示完成或错误消息
    const icon = isError ? '❌' : '✓';
    const color = isError ? '#f44336' : '#4CAF50';
    statusBox.innerHTML = `
      <div style="display: flex; align-items: center;">
        <span style="color: ${color}; margin-right: 8px; font-weight: bold;">${icon}</span>
        <span>${message}</span>
      </div>
    `;
    
    // 自动隐藏提示
    setTimeout(() => {
      if (statusBox && document.body.contains(statusBox)) {
        statusBox.style.opacity = '0';
        statusBox.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
          if (statusBox && document.body.contains(statusBox)) {
            document.body.removeChild(statusBox);
          }
        }, 500);
      }
    }, 3000);
  }
  
  /**
   * 清除所有翻译标签
   */
  static clearTranslations() {
    // 查找并移除所有翻译标签
    const translationLabels = document.querySelectorAll('.llm-translation-label');
    translationLabels.forEach(label => {
      if (label && label.parentNode) {
        label.parentNode.removeChild(label);
      }
    });
    
    // 移除状态框
    const statusBox = document.getElementById('llm-translation-status');
    if (statusBox && document.body.contains(statusBox)) {
      document.body.removeChild(statusBox);
    }
  }
  
  /**
   * 执行全网页翻译（可视区域优先）
   * @returns {Promise<void>}
   */
  static async translateWebpage() {
    try {
      // 显示翻译中提示
      this.showTranslationInProgress();
      
      // 获取所有可翻译节点
      const allNodeInfoArray = this.getTranslatableNodes();
      
      if (allNodeInfoArray.length === 0) {
        this.showTranslationComplete('No translatable text content found');
        return;
      }
      
      // 加载配置
      let config = await this.loadConfig();
      
      // 确保配置完整性
      config = this.ensureCompleteConfig(config);
      
      // 将节点按可视区域排序
      const sortedNodes = this.sortNodesByVisibility(allNodeInfoArray);
      
      // 分批次翻译
      const maxCallCount = 10; // 最大API调用次数
      const minBatchSize = 60; // 最小批次大小
      const maxBatchSize = 100; // 最大批次大小
      let batchSize = minBatchSize;
      let translatedCount = 0;
      let callCount = 0;
      
      // 根据节点总数和最大调用次数动态调整批次大小
      if (sortedNodes.length > minBatchSize * maxCallCount) {
        batchSize = Math.min(maxBatchSize, Math.floor(sortedNodes.length / maxCallCount));
      }
      
      for (let i = 0; i < sortedNodes.length; i += batchSize) {
        callCount++;
        if (callCount > maxCallCount) {
          this.showTranslationComplete('API call limit reached', true);
          return;
        }

        // 获取当前批次的节点
        const batchNodes = sortedNodes.slice(i, i + batchSize);
        
        // 更新进度提示
        this.updateTranslationProgress(i, sortedNodes.length);
        
        // 批量翻译
        const translationResults = await this.batchTranslate(batchNodes, config);
        
        // 显示翻译结果
        this.displayTranslations(batchNodes, translationResults);
        
        translatedCount += batchNodes.length;
        
        // 短暂延迟，避免API限流
        if (i + batchSize < sortedNodes.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // 显示完成提示
      this.showTranslationComplete(`Translated ${translatedCount} text segments`);
    } catch (error) {
      console.error('Webpage translation failed:', error);
      this.showTranslationComplete(`Translation failed: ${error.message}`, true);
    }
  }
}

// 导出网页翻译服务
export default WebpageTranslatorService; 