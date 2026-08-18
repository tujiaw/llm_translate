// webpage_translator.js - 全网页翻译模块

// 导入所需模块
import Utils from './utils.js';
import ApiService from './api.js';
import ConfigService from './config.js';

/**
 * 网页翻译服务类 - 提供全网页翻译功能
 */
class WebpageTranslatorService {
  static activeTranslationController = null;
  static replacedTextNodes = new Map();

  /**
   * 粗略估算文本 token：中日韩字符约 1 token，其余字符约 4 字符/token。
   * @param {string} text - 待估算文本
   * @returns {number} 估算 token 数
   */
  static estimateTokens(text) {
    let cjkCount = 0;
    let otherCount = 0;
    for (const char of text || '') {
      if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(char)) {
        cjkCount++;
      } else {
        otherCount++;
      }
    }
    return Math.max(1, cjkCount + Math.ceil(otherCount / 4));
  }

  /**
   * 将条目均衡分配到固定数量的批次，并限制每批节点数。
   * @param {Array<{text: string, id: string}>} items - 去重后的文本条目
   * @param {number} batchCount - 目标批次数
   * @param {number} maxBatchSize - 每批最大节点数
   * @returns {Array<Array<{text: string, id: string}>>} 均衡后的批次
   */
  static createBalancedBatches(items, batchCount, maxBatchSize) {
    const batches = Array.from({ length: batchCount }, () => ({ items: [], tokens: 0 }));

    for (const item of items) {
      let target = null;
      for (const batch of batches) {
        if (batch.items.length >= maxBatchSize) {
          continue;
        }
        if (!target || batch.tokens < target.tokens) {
          target = batch;
        }
      }
      if (!target) {
        break;
      }
      target.items.push(item);
      target.tokens += this.estimateTokens(item.text);
    }

    return batches.map((batch) => batch.items).filter((batch) => batch.length > 0);
  }

  /**
   * 支持 AbortSignal 的等待，用于限流后的退避重试。
   * @param {number} ms - 等待毫秒数
   * @param {AbortSignal} signal - 取消信号
   * @returns {Promise<void>}
   */
  static waitForRetry(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        const error = new Error('网页翻译已终止');
        error.name = 'AbortError';
        reject(error);
        return;
      }

      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        const error = new Error('网页翻译已终止');
        error.name = 'AbortError';
        reject(error);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * 获取页面中所有可翻译单元。对照模式按段落聚合，替换模式保留文本节点粒度。
   * @param {'bilingual'|'replace'} displayMode - 译文展示方式
   * @returns {Array<{node: Node, text: string, id: string}>} 可翻译单元数组
   */
  static getTranslatableNodes(displayMode = 'bilingual', config) {
    const excludeTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'HEAD', 'META', 'TITLE', 'LINK'];
    const excludeClasses = [
      'llm-translation-label',
      'llm-translate-button',
      'llm-translation-popup',
      'llm-status-text'
    ];

    // 按配置忽略页面区域（页头/页脚/导航等），默认忽略 header/footer。
    const regionSelectors = {
      header: 'header',
      footer: 'footer',
      nav: 'nav',
      aside: 'aside',
      form: 'form',
      dialog: 'dialog, [role="dialog"]'
    };
    const ignoredRegions = Array.isArray(config && config.ignoredPageRegions)
      ? config.ignoredPageRegions
      : ['header', 'footer'];
    const ignoredRegionSelector = ignoredRegions
      .map((id) => regionSelectors[id])
      .filter(Boolean)
      .join(',');

    // 缓存"元素是否位于被忽略区域内"的结果，祖先链只扫描一次
    const insideIgnoredRegionCache = new WeakMap();
    const isInsideIgnoredRegion = (el) => {
      if (!el || !ignoredRegionSelector) {
        return false;
      }
      if (insideIgnoredRegionCache.has(el)) {
        return insideIgnoredRegionCache.get(el);
      }
      let result = false;
      let ancestor = el;
      while (ancestor) {
        if (ancestor.nodeType === Node.ELEMENT_NODE
            && ancestor.matches
            && ancestor.matches(ignoredRegionSelector)) {
          result = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      insideIgnoredRegionCache.set(el, result);
      return result;
    };
    // 代码相关的类名
    const codeClasses = [
      'codeblock', 'hljs', 'prism', 'prettyprint', 'sourceCode', 
      'codehilite', 'wp-block-code', 'brush:', 'sh_',
      'CodeMirror', 'monaco-editor', 'ace_editor', 'syntaxhighlighter', 'SyntaxHighlighter'
    ];
    
    // 代码容器的标识符
    const codeContainers = ['PRE', 'CODE', 'SAMP', 'KBD'];
    const translateNodes = [];

    // 预编译代码相关类名的匹配正则（替代每个祖先都 Array.from(classList)）
    const codeClassPattern = codeClasses
      .map((cls) => cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const codeClassRe = new RegExp(codeClassPattern);

    // 判断单个元素自身是否带代码标识（容器 / 代码类 / data 属性）
    const isBlockedElement = (el) => {
      if (codeContainers.includes(el.nodeName)) {
        return true;
      }
      if (el.classList && codeClassRe.test(el.className)) {
        return true;
      }
      if (el.dataset &&
          (el.dataset.code != null ||
           el.dataset.language != null ||
           el.dataset.syntax != null)) {
        return true;
      }
      return false;
    };

    // 缓存"元素是否位于代码块内"的结果，每条祖先链只扫描一次
    const insideCodeBlockCache = new WeakMap();
    const isInsideCodeBlock = (el) => {
      if (!el) {
        return false;
      }
      if (insideCodeBlockCache.has(el)) {
        return insideCodeBlockCache.get(el);
      }
      let result = false;
      let ancestor = el;
      while (ancestor) {
        if (ancestor.nodeType === Node.ELEMENT_NODE && isBlockedElement(ancestor)) {
          result = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      insideCodeBlockCache.set(el, result);
      return result;
    };

    // 文本节点后是否紧跟译文标签（译文前会插入 <br>，需跳过）。O(1)，替代每节点 querySelector 全子树搜索
    const isTranslatedNode = (node) => {
      if (this.replacedTextNodes.has(node)) {
        return true;
      }
      let next = node.nextSibling;
      while (next && next.nodeName === 'BR') {
        next = next.nextSibling;
      }
      return Boolean(
        next &&
        next.nodeType === Node.ELEMENT_NODE &&
        next.classList &&
        next.classList.contains('llm-translation-label')
      );
    };

    // 折叠空白（含换行），保证"一行一节点"的传输契约
    const normalizeText = (text) => text.replace(/\s+/g, ' ').trim();

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
              excludeClasses.some((cls) => parent.classList.contains(cls)) ||
              parent.closest('.llm-translation-source')) {
            return NodeFilter.FILTER_REJECT;
          }

          // 排除配置中要求忽略的区域（页头/页脚/导航等，祖先链匹配）
          if (isInsideIgnoredRegion(parent)) {
            return NodeFilter.FILTER_REJECT;
          }

          // 排除空文本或只有空格的文本（折叠空白后判断）
          const text = normalizeText(node.textContent);
          if (!text || text.length < 2) {
            return NodeFilter.FILTER_REJECT;
          }

          // 排除已翻译的节点（译文标签紧跟其后）
          if (isTranslatedNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }

          // 排除代码块（祖先链带代码标识）
          if (isInsideCodeBlock(parent)) {
            return NodeFilter.FILTER_REJECT;
          }

          // 排除文本本身像代码的节点
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
      
      // 检查是否包含代码模式（命中阈值即短路，避免 19 个正则全部跑完）
      const matchThreshold = text.length < 100 ? 1 : 2;
      let codePatternMatches = 0;
      for (const pattern of codePatterns) {
        if (pattern.test(text)) {
          codePatternMatches++;
          if (codePatternMatches >= matchThreshold) {
            return true;
          }
        }
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
    
    const paragraphSelector = [
      'p', 'li', 'blockquote', 'figcaption', 'dd', 'dt', 'td', 'th',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'
    ].join(',');
    const findParagraphContainer = (textNode) => {
      const parent = textNode.parentElement;
      const semanticContainer = parent.closest(paragraphSelector);
      if (semanticContainer) {
        return semanticContainer;
      }

      let current = parent;
      while (current && current !== document.body) {
        const display = window.getComputedStyle(current).display;
        if (display !== 'inline' && display !== 'contents') {
          return current;
        }
        current = current.parentElement;
      }
      return parent;
    };

    // 收集符合条件的节点；对照模式将同一段落中的文本合并为一个翻译单元。
    let node;
    let nodeIndex = 0;
    const paragraphGroups = new Map();
    while ((node = walker.nextNode())) {
      // 使用与筛选一致的归一化文本，保证后续去重匹配
      const text = normalizeText(node.textContent);
      if (!text) {
        continue;
      }

      if (displayMode === 'replace') {
        translateNodes.push({
          node,
          text,
          id: `n${nodeIndex++}`
        });
        continue;
      }

      const container = findParagraphContainer(node);
      const existing = paragraphGroups.get(container);
      if (existing) {
        existing.textParts.push(text);
      } else {
        paragraphGroups.set(container, { node: container, textParts: [text] });
      }
    }

    if (displayMode !== 'replace') {
      for (const group of paragraphGroups.values()) {
        const text = normalizeText(group.textParts.join(' '));
        if (text) {
          translateNodes.push({ node: group.node, text, id: `n${nodeIndex++}` });
        }
      }
    }

    return translateNodes;
  }
  
  /**
   * 批量翻译文本
   * @param {Array<{text: string, id: string}>} nodeItems - 要翻译的文本和ID数组
   * @param {object} config - 翻译配置
   * @param {AbortSignal} signal - 用于终止当前网页翻译请求
   * @param {() => boolean} reserveApiCall - 在每次实际请求前占用调用额度
   * @returns {Promise<Array<{id: string, translation: string}>>} 翻译结果数组
   */
  static async batchTranslate(nodeItems, config, signal, reserveApiCall = () => true) {
    if (!nodeItems || nodeItems.length === 0) {
      return [];
    }
    
    try {
      const nativeLanguage = config.nativeLanguage || 'zh';
      const promptLanguage = Utils.getLanguageNameInEnglish(nativeLanguage);
      
      const formattedTexts = nodeItems.map(item => `${item.id}:::${item.text}`);
      
      const systemPrompt = `You are a translation assistant. Please translate the following list of texts into ${promptLanguage}. 
Each line has a format of "ID:::Text". Preserve the exact ID and translate only the text part.
Your response must follow the same format of "ID:::Translated Text" and have exactly the same number of lines as the input.
Do not add any explanation or additional content.`;
      
      const entry = ConfigService.getCurrentModel(config);
      if (!entry) {
        throw new Error('Model information not found: no model selected');
      }

      if (entry.serviceType === 'bing') {
        return this.batchTranslateViaWebService(nodeItems, config, entry, signal, reserveApiCall);
      }

      const apiEndpoint = ApiService.normalizeChatEndpoint(entry.baseUrl);
      const apiKey = (entry.apiKey || '').trim();
      const modelName = (entry.model || '').trim();

      if (!apiEndpoint || !apiKey) {
        const errorMessage = '请在扩展设置中为当前模型填写 Base URL 与 API Key';
        console.error(errorMessage);
        this.showTranslationComplete(errorMessage, true);
        return nodeItems.map(item => ({
          id: item.id,
          translation: `[${errorMessage}]`
        }));
      }

      if (!modelName) {
        const errorMessage = '请在扩展设置中填写 Model 名称';
        console.error(errorMessage);
        this.showTranslationComplete(errorMessage, true);
        return nodeItems.map(item => ({
          id: item.id,
          translation: `[${errorMessage}]`
        }));
      }

      const queryText = formattedTexts.join('\n');

      let requestBody;
      try {
        requestBody = ApiService.mergeChatBody(entry, systemPrompt, queryText);
      } catch (mergeErr) {
        console.error(mergeErr);
        return nodeItems.map(item => ({
          id: item.id,
          translation: `[${mergeErr.message}]`
        }));
      }

      console.log(`Preparing batch translation request: model=${modelName}, endpoint=${apiEndpoint}`);

      const apiOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal
      };

      console.log(`Sending batch translation request to: ${apiEndpoint}`);
      const maxRetries = 2;
      let response;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (!reserveApiCall()) {
          if (response) {
            break;
          }
          const error = new Error('已达到接口调用上限');
          error.code = 'API_CALL_LIMIT_REACHED';
          throw error;
        }
        response = await fetch(apiEndpoint, apiOptions);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === maxRetries) {
          break;
        }
        const retryDelay = 500 * (2 ** attempt);
        console.warn(`API request returned ${response.status}; retrying in ${retryDelay}ms`);
        try {
          await response.body?.cancel();
        } catch {
          // 忽略释放响应体失败，仍按计划退避重试。
        }
        await this.waitForRetry(retryDelay, signal);
      }
      
      if (!response.ok) {
        let errorMessage = '';
        try {
          const errorText = await response.text();
          errorMessage = `API请求失败 (${response.status}): ${errorText}`;
          
          if (response.status === 401) {
            const friendlyError = 'Authentication failed: API key may be invalid or not properly configured.';
            console.error(friendlyError);
            this.showTranslationComplete(friendlyError, true);
            return nodeItems.map(item => ({
              id: item.id,
              translation: '[API Authentication failed]'
            }));
          }
          if (response.status === 403) {
            const friendlyError = 'Access denied: Your API key may not have permission to access this resource.';
            console.error(friendlyError);
            this.showTranslationComplete(friendlyError, true);
            return nodeItems.map(item => ({
              id: item.id,
              translation: '[API Authentication failed]'
            }));
          }
          if (response.status === 429) {
            const friendlyError = 'Too many requests: API call limit reached. Please try again later.';
            console.error(friendlyError);
            this.showTranslationComplete(friendlyError, true);
            return nodeItems.map(item => ({
              id: item.id,
              translation: '[API call limit reached]'
            }));
          }
        } catch (e) {
          errorMessage = `API请求失败 (${response.status})`;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();

      let translatedText;
      try {
        translatedText = ApiService.parseApiResponse(data);
      } catch (parseErr) {
        throw new Error(parseErr.message || String(parseErr));
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
      if (signal?.aborted || error?.name === 'AbortError' || error?.code === 'API_CALL_LIMIT_REACHED') {
        throw error;
      }
      console.error('Batch translation error:', error);
      // 返回错误信息数组
      return nodeItems.map(item => ({
        id: item.id,
        translation: `[Translation Error: ${error.message}]`
      }));
    }
  }

  /**
   * 通过 Bing 免费翻译接口逐条翻译批次内文本。
   * @param {Array<{text: string, id: string}>} nodeItems - 要翻译的文本和ID数组
   * @param {object} config - 翻译配置
   * @param {object} entry - 当前服务条目（serviceType 为 bing）
   * @param {AbortSignal} signal - 用于终止当前网页翻译请求
   * @param {() => boolean} reserveApiCall - 整个批次占用一次调用额度
   * @returns {Promise<Array<{id: string, translation: string}>>} 翻译结果数组
   */
  static async batchTranslateViaWebService(nodeItems, config, entry, signal, reserveApiCall = () => true) {
    if (!reserveApiCall()) {
      const error = new Error('已达到接口调用上限');
      error.code = 'API_CALL_LIMIT_REACHED';
      throw error;
    }

    const nativeLanguage = config.nativeLanguage || 'zh';
    const resultsById = new Map();

    const translateOne = async (item) => {
      if (signal?.aborted) {
        const error = new Error('网页翻译已终止');
        error.name = 'AbortError';
        throw error;
      }
      try {
        const translation = await ApiService.translateViaBing(item.text, nativeLanguage, signal);
        resultsById.set(item.id, { id: item.id, translation });
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') {
          throw error;
        }
        console.warn(`单条翻译失败 (${item.id}):`, error);
        resultsById.set(item.id, { id: item.id, translation: '[Translation Error]' });
      }
    };

    // 固定并发池逐条翻译，单条失败不中断整批。
    const CONCURRENCY = 4;
    let cursor = 0;
    const worker = async () => {
      while (cursor < nodeItems.length) {
        const index = cursor++;
        await translateOne(nodeItems[index]);
      }
    };
    const workers = [];
    const workerCount = Math.min(CONCURRENCY, nodeItems.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const results = [];
    for (const item of nodeItems) {
      const result = resultsById.get(item.id);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }
  
  /**
   * 在网页中显示翻译结果
   * @param {Array<{node: Node, text: string, id: string}>} nodes - 节点信息数组 
   * @param {Array<{id: string, translation: string}>} translations - 翻译结果数组
   * @param {'bilingual'|'replace'} displayMode - 译文展示方式
   */
  static displayTranslations(nodes, translations, displayMode = 'bilingual') {
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

      // 译文与原文相同（数字、专有名词、本就不需要翻译等），没必要显示译文
      if (String(translation).trim() === (nodeInfo.text || '').trim()) {
        continue;
      }

      try {
        if (displayMode === 'replace') {
          const originalText = nodeInfo.node.textContent || '';
          const leadingWhitespace = originalText.match(/^\s*/)?.[0] || '';
          const trailingWhitespace = originalText.match(/\s*$/)?.[0] || '';
          const translatedText = `${leadingWhitespace}${translation}${trailingWhitespace}`;
          this.replacedTextNodes.set(nodeInfo.node, {
            original: originalText,
            translation: translatedText
          });
          nodeInfo.node.textContent = translatedText;
          continue;
        }

        const sourceElement = nodeInfo.node.nodeType === Node.ELEMENT_NODE
          ? nodeInfo.node
          : nodeInfo.node.parentElement;
        if (!sourceElement || sourceElement.querySelector(':scope > .llm-translation-label')) {
          continue;
        }

        // 译文单独成行：先插入 <br> 再追加译文（参考沉浸式翻译的双语对照做法），尽量少加效果
        sourceElement.classList.add('llm-translation-source');
        sourceElement.appendChild(document.createElement('br'));

        const translationLabel = document.createElement('span');
        translationLabel.className = 'llm-translation-label';
        translationLabel.textContent = translation;
        translationLabel.dataset.translationId = nodeInfo.id;
        sourceElement.appendChild(translationLabel);
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
      const elementA = a.node.nodeType === Node.ELEMENT_NODE ? a.node : a.node.parentElement;
      const elementB = b.node.nodeType === Node.ELEMENT_NODE ? b.node : b.node.parentElement;
      const rectA = elementA.getBoundingClientRect();
      const rectB = elementB.getBoundingClientRect();
      
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
   * @param {number} completedBatches - 已完成批次数
   * @param {number} totalBatches - 总批次数
   * @param {number} activeRequests - 当前活动请求数
   * @param {number} maxConcurrent - 并发上限
   */
  static updateTranslationProgress(current, total, completedBatches, totalBatches, activeRequests, maxConcurrent) {
    const statusBox = document.getElementById('llm-translation-status');
    if (!statusBox) {
      return;
    }
    const percent = Math.round((current / total) * 100);
    statusBox.innerHTML = `
      <div class="llm-status-row">
        <div class="llm-status-spinner"></div>
        <span class="llm-status-text">正在翻译 ${percent}%（批次 ${completedBatches}/${totalBatches}，并行 ${activeRequests}/${maxConcurrent}）</span>
        <button type="button" class="llm-status-cancel" title="终止翻译" aria-label="终止翻译">×</button>
      </div>
    `;
    this.bindCancelAction(statusBox);
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
    config = config || {};
    config.nativeLanguage = config.nativeLanguage || 'zh';
    config.maxApiCalls = Math.min(50, Math.max(1, Number.parseInt(config.maxApiCalls, 10) || 10));
    config.concurrentApiCalls = Math.min(
      20,
      Math.max(1, Number.parseInt(config.concurrentApiCalls, 10) || 3)
    );
    config.translationDisplayMode = config.translationDisplayMode === 'replace'
      ? 'replace'
      : 'bilingual';
    config.ignoredPageRegions = Array.isArray(config.ignoredPageRegions)
      ? config.ignoredPageRegions
      : ['header', 'footer'];
    if (!Array.isArray(config.models)) {
      config.models = [];
    }
    if (!config.models.some((m) => m.id === config.currentModelId)) {
      config.currentModelId = config.models[0]?.id || '';
    }
    return config;
  }
  
  /**
   * 显示翻译进行中提示
   */
  static showTranslationInProgress() {
    let statusBox = document.getElementById('llm-translation-status');
    if (!statusBox) {
      statusBox = document.createElement('div');
      statusBox.id = 'llm-translation-status';
      document.body.appendChild(statusBox);
    }

    statusBox.classList.remove('is-error');
    statusBox.innerHTML = `
      <div class="llm-status-row">
        <div class="llm-status-spinner"></div>
        <span class="llm-status-text">正在翻译网页…</span>
        <button type="button" class="llm-status-cancel" title="终止翻译" aria-label="终止翻译">×</button>
      </div>
    `;
    this.bindCancelAction(statusBox);
  }

  /**
   * 绑定进度提示中的终止按钮。
   * @param {HTMLElement} statusBox - 翻译状态框
   */
  static bindCancelAction(statusBox) {
    const cancelButton = statusBox.querySelector('.llm-status-cancel');
    if (!cancelButton) {
      return;
    }
    cancelButton.addEventListener('click', () => {
      cancelButton.disabled = true;
      const statusText = statusBox.querySelector('.llm-status-text');
      if (statusText) {
        statusText.textContent = '正在终止翻译…';
      }
      this.cancelTranslation();
    });
  }

  /**
   * 终止当前网页翻译，包括所有正在进行的并行请求。
   */
  static cancelTranslation() {
    const controller = this.activeTranslationController;
    if (controller && !controller.signal.aborted) {
      controller.abort();
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
      document.body.appendChild(statusBox);
    }

    statusBox.classList.toggle('is-error', Boolean(isError));
    const icon = isError ? '✕' : '✓';
    statusBox.innerHTML = `
      <div class="llm-status-row">
        <span class="llm-status-icon">${icon}</span>
        <span>${message}</span>
      </div>
    `;

    setTimeout(() => {
      if (!statusBox || !document.body.contains(statusBox)) {
        return;
      }
      statusBox.classList.add('is-fading');
      setTimeout(() => {
        if (statusBox && document.body.contains(statusBox)) {
          document.body.removeChild(statusBox);
        }
      }, 400);
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
    document.querySelectorAll('.llm-translation-source').forEach((source) => {
      source.classList.remove('llm-translation-source');
    });

    for (const [node, text] of this.replacedTextNodes) {
      node.textContent = text.original;
    }
    this.replacedTextNodes.clear();
    
    const statusBox = document.getElementById('llm-translation-status');
    if (statusBox && document.body.contains(statusBox)) {
      document.body.removeChild(statusBox);
    }
    document.body.classList.remove('llm-translations-hidden');
  }

  /**
   * 切换译文标签的显示/隐藏（显示原文 / 显示译文）
   * @returns {boolean} 译文当前是否被隐藏
   */
  static toggleTranslations() {
    const hidden = document.body.classList.toggle('llm-translations-hidden');
    for (const [node, text] of this.replacedTextNodes) {
      node.textContent = hidden ? text.original : text.translation;
    }
    return hidden;
  }

  /**
   * 获取网页当前的翻译状态
   * @returns {{hasTranslations: boolean, hidden: boolean}} 是否已有译文、译文是否被隐藏
   */
  static getTranslationState() {
    const labels = document.querySelectorAll('.llm-translation-label');
    return {
      hasTranslations: labels.length > 0 || this.replacedTextNodes.size > 0,
      hidden: document.body.classList.contains('llm-translations-hidden')
    };
  }
  
  /**
   * 执行全网页翻译（可视区域优先）
   * @returns {Promise<void>}
   */
  static async translateWebpage() {
    if (this.activeTranslationController && !this.activeTranslationController.signal.aborted) {
      this.activeTranslationController.abort();
    }
    const controller = new AbortController();
    const { signal } = controller;
    this.activeTranslationController = controller;

    try {
      // 显示翻译中提示
      this.showTranslationInProgress();

      // 加载并确保配置完整性
      let config = await this.loadConfig();
      config = this.ensureCompleteConfig(config);

      // 对照模式按段落聚合，直接替换模式保持文本节点粒度。
      const allNodeInfoArray = this.getTranslatableNodes(config.translationDisplayMode, config);

      if (allNodeInfoArray.length === 0) {
        this.showTranslationComplete('未找到可翻译的文本');
        return;
      }

      // 将节点按可视区域排序
      const sortedNodes = this.sortNodesByVisibility(allNodeInfoArray);

      // 去重：相同文本只翻译一次，结果再展开回所有节点
      const textToNodes = new Map();
      for (const nodeInfo of sortedNodes) {
        const list = textToNodes.get(nodeInfo.text);
        if (list) {
          list.push(nodeInfo);
        } else {
          textToNodes.set(nodeInfo.text, [nodeInfo]);
        }
      }
      const uniqueItems = Array.from(textToNodes.entries()).map(([text, nodes]) => ({
        id: nodes[0].id,
        text
      }));

      // 自适应分批：小页面避免过度拆分，大页面尽量填满并发槽。
      const maxCallCount = config.maxApiCalls;
      const maxBatchSize = 100; // 每批最大节点数
      const targetBatchTokens = 1200;
      const minParallelBatchTokens = 400;
      const totalTokens = uniqueItems.reduce(
        (sum, item) => sum + this.estimateTokens(item.text),
        0
      );
      const tokenDrivenBatchCount = Math.ceil(totalTokens / targetBatchTokens);
      const usefulParallelSlots = Math.max(1, Math.floor(totalTokens / minParallelBatchTokens));
      const parallelDrivenBatchCount = Math.min(config.concurrentApiCalls, usefulParallelSlots);
      const nodeDrivenBatchCount = Math.ceil(uniqueItems.length / maxBatchSize);
      const desiredBatchCount = Math.min(
        maxCallCount,
        uniqueItems.length,
        Math.max(tokenDrivenBatchCount, parallelDrivenBatchCount, nodeDrivenBatchCount)
      );
      const batches = this.createBalancedBatches(uniqueItems, desiredBatchCount, maxBatchSize);
      const scheduledItemCount = batches.reduce((sum, batch) => sum + batch.length, 0);

      // 固定并发池立即领取批次；仅在服务端限流时退避。
      const maxConcurrent = Math.min(config.concurrentApiCalls, maxCallCount, batches.length);
      console.log(
        `Translation plan: tokens≈${totalTokens}, batches=${batches.length}, concurrency=${maxConcurrent}`
      );
      let callCount = 0;
      let translatedCount = 0;
      let completedBatches = 0;
      let activeRequests = 0;
      let callLimitReached = scheduledItemCount < uniqueItems.length;
      let nextBatchIndex = 0;
      const reserveApiCall = () => {
        if (callCount >= maxCallCount) {
          callLimitReached = true;
          return false;
        }
        callCount++;
        return true;
      };
      const ensureNotCancelled = () => {
        if (!signal.aborted) {
          return;
        }
        const error = new Error('网页翻译已终止');
        error.name = 'AbortError';
        throw error;
      };

      const translateBatch = async (index) => {
        ensureNotCancelled();
        if (callCount >= maxCallCount) {
          callLimitReached = true;
          return;
        }
        const batchNodes = batches[index];
        activeRequests++;
        this.updateTranslationProgress(
          translatedCount,
          sortedNodes.length,
          completedBatches,
          batches.length,
          activeRequests,
          maxConcurrent
        );

        try {
          const translationResults = await this.batchTranslate(
            batchNodes,
            config,
            signal,
            reserveApiCall
          );
          ensureNotCancelled();

          // 把去重后的翻译结果展开回当前批次的所有原始节点
          const idToTranslation = new Map(translationResults.map((r) => [r.id, r.translation]));
          const batchRawNodes = [];
          const expandedTranslations = [];
          for (const item of batchNodes) {
            const nodes = textToNodes.get(item.text) || [];
            batchRawNodes.push(...nodes);
            const translation = idToTranslation.get(item.id);
            if (translation) {
              for (const nodeInfo of nodes) {
                expandedTranslations.push({ id: nodeInfo.id, translation });
              }
            }
          }

          this.displayTranslations(
            batchRawNodes,
            expandedTranslations,
            config.translationDisplayMode
          );

          translatedCount += batchRawNodes.length;
          completedBatches++;
        } finally {
          activeRequests--;
          if (!signal.aborted) {
            this.updateTranslationProgress(
              translatedCount,
              sortedNodes.length,
              completedBatches,
              batches.length,
              activeRequests,
              maxConcurrent
            );
          }
        }
      };

      const worker = async () => {
        while (nextBatchIndex < batches.length) {
          ensureNotCancelled();
          if (callCount >= maxCallCount) {
            callLimitReached = true;
            break;
          }
          const index = nextBatchIndex++;
          await translateBatch(index);
        }
      };

      await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));

      if (callLimitReached) {
        this.showTranslationComplete('已达到接口调用上限', true);
        return;
      }

      // 显示完成提示
      this.showTranslationComplete(`已翻译 ${translatedCount} 段文本`);
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError') {
        console.log('Webpage translation cancelled');
        if (this.activeTranslationController === controller) {
          this.showTranslationComplete('已终止翻译');
        }
      } else if (error?.code === 'API_CALL_LIMIT_REACHED') {
        this.showTranslationComplete('已达到接口调用上限', true);
      } else {
        console.error('Webpage translation failed:', error);
        this.showTranslationComplete(`翻译失败: ${error.message}`, true);
      }
    } finally {
      if (this.activeTranslationController === controller) {
        this.activeTranslationController = null;
      }
    }
  }
}

// 导出网页翻译服务
export default WebpageTranslatorService;
