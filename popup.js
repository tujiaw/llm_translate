// popup.js - Popup window script
document.addEventListener('DOMContentLoaded', async function() {
  try {
    const [configModule, uiModule, utilsModule, apiModule] = await Promise.all([
      import(chrome.runtime.getURL('config.js')),
      import(chrome.runtime.getURL('ui.js')),
      import(chrome.runtime.getURL('utils.js')),
      import(chrome.runtime.getURL('api.js'))
    ]);

    const ConfigService = configModule.default;
    const UiService = uiModule.default;
    const Utils = utilsModule.default;
    const ApiService = apiModule.default;

    console.log('Initializing popup window');

    let workingModels = [];
    let selectedModelId = '';
    let testAbortController = null;
    let currentMode = 'page';

    const elements = getDomElements();

    await loadSettings();
    setupEventListeners();
    setMode('page');
    await checkForSelectedText();

    // ==================== DOM 元素 ====================

    function getDomElements() {
      return {
        // 视图
        mainView: document.getElementById('mainView'),
        settingsView: document.getElementById('settingsView'),
        translationSettingsView: document.getElementById('translationSettingsView'),
        openSettingsBtn: document.getElementById('openSettingsBtn'),
        openTranslationSettingsBtn: document.getElementById('openTranslationSettingsBtn'),
        backBtn: document.getElementById('backBtn'),
        translationSettingsBackBtn: document.getElementById('translationSettingsBackBtn'),
        // 模式切换
        textModeBtn: document.getElementById('textModeBtn'),
        pageModeBtn: document.getElementById('pageModeBtn'),
        textPanel: document.getElementById('textPanel'),
        pagePanel: document.getElementById('pagePanel'),
        // 文本翻译
        inputText: document.getElementById('inputText'),
        outputText: document.getElementById('outputText'),
        translateBtn: document.getElementById('translateBtn'),
        clearTextBtn: document.getElementById('clearTextBtn'),
        copyBtn: document.getElementById('copyBtn'),
        loadingSpinner: document.getElementById('loadingSpinner'),
        // 网页翻译
        translateWebpageBtn: document.getElementById('translateWebpageBtn'),
        togglePageBtn: document.getElementById('togglePageBtn'),
        clearWebpageBtn: document.getElementById('clearWebpageBtn'),
        pageStatus: document.getElementById('pageStatus'),
        translationDisplayMode: document.getElementById('translationDisplayMode'),
        maxApiCalls: document.getElementById('maxApiCalls'),
        concurrentApiCalls: document.getElementById('concurrentApiCalls'),
        // 目标语言
        nativeLanguage: document.getElementById('nativeLanguage'),
        ignoredPageRegions: document.getElementById('ignoredPageRegions'),
        textSelectionEnabled: document.getElementById('textSelectionEnabled'),
        selectionOffsetX: document.getElementById('selectionOffsetX'),
        selectionOffsetY: document.getElementById('selectionOffsetY'),
        // 模型栏
        modelBar: document.getElementById('modelBar'),
        modelBarName: document.getElementById('modelBarName'),
        modelBarBadge: document.getElementById('modelBarBadge'),
        // 模型设置
        modelSelect: document.getElementById('modelSelect'),
        removeModelBtn: document.getElementById('removeModelBtn'),
        modelProvider: document.getElementById('modelProvider'),
        modelProviderHint: document.getElementById('modelProviderHint'),
        modelBaseUrl: document.getElementById('modelBaseUrl'),
        modelName: document.getElementById('modelName'),
        modelApiKey: document.getElementById('modelApiKey'),
        modelBodyJson: document.getElementById('modelBodyJson'),
        showModelKeyBtn: document.getElementById('showModelKeyBtn'),
        testModelBtn: document.getElementById('testModelBtn'),
        saveModelBtn: document.getElementById('saveModelBtn'),
        modelTestStatus: document.getElementById('modelTestStatus'),
        advancedJson: document.getElementById('advancedJson'),
        llmOnlyFields: document.getElementById('llmOnlyFields')
      };
    }

    // ==================== 通用辅助 ====================

    function cloneModels(models) {
      return JSON.parse(JSON.stringify(models || []));
    }

    function entryLabel(entry) {
      return ConfigService.displayName(entry);
    }

    function isWebService(entry) {
      const type = (entry && entry.serviceType) || 'llm';
      return type === 'bing';
    }

    function currentEntry() {
      return workingModels.find((item) => item.id === selectedModelId) || null;
    }

    function currentEntryName() {
      const entry = currentEntry();
      if (!entry) {
        return '未配置';
      }
      return entryLabel(entry);
    }

    function setTestStatus(message, type) {
      elements.modelTestStatus.textContent = message || '';
      elements.modelTestStatus.className = 'model-test-status';
      if (type) {
        elements.modelTestStatus.classList.add(`is-${type}`);
      }
    }

    // 由编辑器表单构建一条模型配置（尚未保存）
    function buildEditorEntry() {
      const providerId = elements.modelProvider.value || 'custom';
      const provider = ConfigService.getProvider(providerId);
      const isWeb = provider.type === 'bing';
      const model = isWeb ? '' : elements.modelName.value.trim();
      return {
        id: ConfigService.identityKey(providerId, model),
        providerId,
        serviceType: provider.type || 'llm',
        baseUrl: isWeb ? '' : elements.modelBaseUrl.value.trim(),
        model,
        apiKey: isWeb ? '' : elements.modelApiKey.value.trim(),
        bodyJson: isWeb ? '{}' : (elements.modelBodyJson.value.trim() || '{}')
      };
    }

    // ==================== 模型栏 / 面板状态 ====================

    function refreshModelBar() {
      const entry = currentEntry();
      const ready = ConfigService.isModelReady(entry);
      elements.modelBarName.textContent = currentEntryName();
      elements.modelBarBadge.textContent = ready ? '已配置' : '未配置';
      elements.modelBarBadge.classList.toggle('is-ready', ready);
    }

    // 切换当前使用的模型：同步编辑器与模型栏，并立即持久化，无需再点保存。
    function selectModel(modelId) {
      selectedModelId = modelId;
      applyWorkingToEditor(currentEntry());
      setTestStatus('', '');
      saveSettings();
    }

    function showView(name) {
      const showSettings = name === 'settings';
      const showTranslationSettings = name === 'translationSettings';
      elements.mainView.classList.toggle('hidden', showSettings || showTranslationSettings);
      elements.settingsView.classList.toggle('hidden', !showSettings);
      elements.translationSettingsView.classList.toggle('hidden', !showTranslationSettings);
      if (!showSettings && !showTranslationSettings) {
        refreshModelBar();
      }
    }

    function clampSetting(input, fallback, max) {
      const parsed = Number.parseInt(input.value, 10);
      const value = Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
      input.value = String(value);
      return value;
    }

    // ==================== 模式切换 ====================

    function setMode(mode) {
      currentMode = mode;
      const isText = mode === 'text';
      elements.textModeBtn.classList.toggle('active', isText);
      elements.textModeBtn.setAttribute('aria-selected', String(isText));
      elements.pageModeBtn.classList.toggle('active', !isText);
      elements.pageModeBtn.setAttribute('aria-selected', String(!isText));
      elements.textPanel.classList.toggle('hidden', !isText);
      elements.pagePanel.classList.toggle('hidden', isText);
      if (!isText) {
        refreshPagePanel();
      }
    }

    // ==================== 配置读取 ====================

    function populateProviderSelect() {
      elements.modelProvider.innerHTML = '';
      ConfigService.getProviders().forEach((provider) => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        elements.modelProvider.appendChild(option);
      });
    }

    function populateDisplayModeSelect() {
      elements.translationDisplayMode.innerHTML = '';
      ConfigService.getDisplayModes().forEach((mode) => {
        const option = document.createElement('option');
        option.value = mode.id;
        option.textContent = mode.name;
        option.title = mode.hint;
        elements.translationDisplayMode.appendChild(option);
      });
    }

    function renderRegionCheckboxes(selectedIds) {
      elements.ignoredPageRegions.innerHTML = '';
      const selected = new Set(Array.isArray(selectedIds) ? selectedIds : ['header', 'footer']);
      ConfigService.getPageRegionOptions().forEach((region) => {
        const label = document.createElement('label');
        label.className = 'region-checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = region.id;
        checkbox.checked = selected.has(region.id);
        checkbox.addEventListener('change', () => saveSettings());
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(region.name));
        elements.ignoredPageRegions.appendChild(label);
      });
    }

    function collectIgnoredRegions() {
      const ids = [];
      elements.ignoredPageRegions
        .querySelectorAll('input[type="checkbox"]:checked')
        .forEach((checkbox) => ids.push(checkbox.value));
      return ids;
    }

    // 划词翻译关闭时，偏移输入置灰
    function syncSelectionInputsDisabled() {
      const enabled = elements.textSelectionEnabled.checked;
      elements.selectionOffsetX.disabled = !enabled;
      elements.selectionOffsetY.disabled = !enabled;
    }

    // 偏移允许负值，默认 0，范围 -50~50
    function clampOffsetSetting(input) {
      const parsed = Number.parseInt(input.value, 10);
      const value = Number.isFinite(parsed) ? Math.min(50, Math.max(-50, parsed)) : 0;
      input.value = String(value);
      return value;
    }

    // 把某条配置填入编辑器；entry 为 null 时展示空编辑器（默认 Bing）
    function applyWorkingToEditor(entry) {
      const isWeb = entry ? isWebService(entry) : true;
      elements.llmOnlyFields.classList.toggle('hidden', isWeb);
      elements.advancedJson.classList.toggle('hidden', isWeb);

      const provider = entry
        ? ConfigService.getProvider(ConfigService.inferProviderId(entry.baseUrl, entry.providerId))
        : ConfigService.getProvider('bing');
      elements.modelProvider.value = provider.id;
      elements.modelProviderHint.textContent = provider.hint;
      elements.modelBaseUrl.value = entry ? entry.baseUrl || '' : '';
      elements.modelName.value = entry ? entry.model || '' : '';
      elements.modelApiKey.value = entry ? entry.apiKey || '' : '';
      elements.modelBodyJson.value = (entry && entry.bodyJson) ? (entry.bodyJson.trim() || '{}') : '{}';
      elements.advancedJson.open = false;
      refreshModelBar();
    }

    // 仅重建下拉选项与选中值，不动编辑器内容
    function populateModelSelect() {
      const selectEl = elements.modelSelect;
      selectEl.innerHTML = '';

      workingModels.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = entryLabel(item);
        selectEl.appendChild(option);
      });

      if (workingModels.length === 0) {
        selectedModelId = '';
        elements.removeModelBtn.disabled = true;
        return;
      }

      elements.removeModelBtn.disabled = false;
      // 仅当选中项已不存在（如删除后）才回退到第一个
      if (!workingModels.some((item) => item.id === selectedModelId)) {
        selectedModelId = workingModels[0].id;
      }
      selectEl.value = selectedModelId;
    }

    function ensureDefaultModel() {
      if (workingModels.length > 0) {
        return false;
      }
      const created = ConfigService.createModelEntry();
      workingModels = [created];
      selectedModelId = created.id;
      return true;
    }

    async function loadSettings() {
      try {
        console.log('Loading settings...');
        const config = await ConfigService.load();

        workingModels = cloneModels(config.models);
        selectedModelId = config.currentModelId || '';

        populateLanguageSelect(elements.nativeLanguage);
        populateProviderSelect();
        populateDisplayModeSelect();
        renderRegionCheckboxes(config.ignoredPageRegions);

        ensureDefaultModel();
        populateModelSelect();
        applyWorkingToEditor(currentEntry());

        if (config.nativeLanguage) {
          elements.nativeLanguage.value = config.nativeLanguage;
        }

        if (config.maxApiCalls) {
          elements.maxApiCalls.value = config.maxApiCalls;
        }
        elements.concurrentApiCalls.value = config.concurrentApiCalls || 3;
        elements.translationDisplayMode.value = config.translationDisplayMode || 'bilingual';
        elements.textSelectionEnabled.checked = config.textSelectionEnabled !== false;
        elements.selectionOffsetX.value = config.selectionOffsetX || 0;
        elements.selectionOffsetY.value = config.selectionOffsetY || 0;
        syncSelectionInputsDisabled();

        refreshModelBar();

        if (!ConfigService.isModelReady(currentEntry())) {
          showView('settings');
          setTestStatus('请先填写 API Key，建议先点「测试连接」', 'pending');
          elements.modelApiKey.focus();
        }

        elements.translateBtn.disabled = !elements.inputText.value.trim();
      } catch (error) {
        console.error('Error loading settings:', error);
        UiService.showNotification('加载设置失败: ' + error.message, 'error');
      }
    }

    function populateLanguageSelect(selectElement) {
      selectElement.innerHTML = '';
      Utils.getSupportedLanguages().forEach((lang) => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        selectElement.appendChild(option);
      });
    }

    // ==================== 事件绑定 ====================

    function ensureModelReady() {
      if (ConfigService.isModelReady(currentEntry())) {
        return true;
      }
      showView('settings');
      setTestStatus('请先填写 API Key，建议先点「测试连接」', 'error');
      elements.modelApiKey.focus();
      return false;
    }

    function setupEventListeners() {
      // 视图导航
      elements.openSettingsBtn.addEventListener('click', () => showView('settings'));
      elements.openTranslationSettingsBtn.addEventListener(
        'click',
        () => showView('translationSettings')
      );
      elements.modelBar.addEventListener('click', () => showView('settings'));
      elements.backBtn.addEventListener('click', () => showView('main'));
      elements.translationSettingsBackBtn.addEventListener('click', () => showView('main'));

      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') {
          return;
        }
        if (!elements.settingsView.classList.contains('hidden')
          || !elements.translationSettingsView.classList.contains('hidden')) {
          showView('main');
        }
      });

      // 模式切换
      elements.textModeBtn.addEventListener('click', () => setMode('text'));
      elements.pageModeBtn.addEventListener('click', () => setMode('page'));

      // 文本翻译
      elements.translateBtn.addEventListener('click', () => translateText());
      elements.clearTextBtn.addEventListener('click', () => clearText());
      elements.copyBtn.addEventListener('click', () => copyOutput());

      elements.inputText.addEventListener('input', () => {
        const hasText = Boolean(elements.inputText.value.trim());
        elements.translateBtn.disabled = !hasText;
        elements.clearTextBtn.classList.toggle('hidden', !hasText);
      });

      // Ctrl/Cmd + Enter 快速翻译
      elements.inputText.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          translateText();
        }
      });

      // 网页翻译
      elements.translateWebpageBtn.addEventListener('click', () => translateWebpage());
      elements.togglePageBtn.addEventListener('click', () => togglePageTranslations());
      elements.clearWebpageBtn.addEventListener('click', () => clearWebpageTranslations());

      // 目标语言
      elements.nativeLanguage.addEventListener('change', () => {
        saveSettings();
      });

      elements.translationDisplayMode.addEventListener('change', () => {
        saveSettings();
      });

      [elements.maxApiCalls, elements.concurrentApiCalls].forEach((field) => {
        field.addEventListener('change', () => {
          const isMaxCalls = field === elements.maxApiCalls;
          clampSetting(field, isMaxCalls ? 20 : 3, isMaxCalls ? 50 : 20);
          saveSettings();
        });
      });

      elements.textSelectionEnabled.addEventListener('change', () => {
        syncSelectionInputsDisabled();
        saveSettings();
      });

      [elements.selectionOffsetX, elements.selectionOffsetY].forEach((field) => {
        field.addEventListener('change', () => {
          clampOffsetSetting(field);
          saveSettings();
        });
      });

      // 模型设置
      elements.testModelBtn.addEventListener('click', () => testModelConnection());
      elements.saveModelBtn.addEventListener('click', () => saveModelNow());

      elements.showModelKeyBtn.addEventListener('click', () =>
        toggleApiKeyVisibility(elements.modelApiKey, elements.showModelKeyBtn));

      // 手动选择已保存的模型：设为当前使用模型并立即生效
      elements.modelSelect.addEventListener('change', () => {
        selectModel(elements.modelSelect.value);
      });

      // 切换服务商：只更新编辑器表单，不改变列表与当前模型
      elements.modelProvider.addEventListener('change', () => {
        const provider = ConfigService.getProvider(elements.modelProvider.value);
        const isWeb = provider.type === 'bing';
        elements.llmOnlyFields.classList.toggle('hidden', isWeb);
        elements.advancedJson.classList.toggle('hidden', isWeb);
        elements.modelProviderHint.textContent = provider.hint;
        // 只有为空时才自动填入默认值
        if (!isWeb && !elements.modelBaseUrl.value.trim()) {
          elements.modelBaseUrl.value = provider.baseUrl || '';
        }
        if (!isWeb && !elements.modelName.value.trim() && provider.defaultModel) {
          elements.modelName.value = provider.defaultModel;
        }
        setTestStatus('', '');
      });

      elements.removeModelBtn.addEventListener('click', () => {
        if (workingModels.length === 0) {
          return;
        }
        if (!window.confirm('确定删除当前模型配置？')) {
          return;
        }
        workingModels = workingModels.filter((item) => item.id !== selectedModelId);
        ensureDefaultModel();
        populateModelSelect();
        applyWorkingToEditor(currentEntry());
        setTestStatus('', '');
        saveSettings();
      });
    }

    // ==================== 文本翻译 ====================

    async function checkForSelectedText() {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0] || tabs[0].id == null) {
          return;
        }
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' });
        if (response && response.selectedText) {
          elements.inputText.value = response.selectedText;
          elements.translateBtn.disabled = false;
          elements.clearTextBtn.classList.remove('hidden');
        }
      } catch (error) {
        console.error('Error getting selected text:', error);
      }
    }

    async function translateText() {
      console.log('Starting translation...');
      const text = elements.inputText.value.trim();
      if (!text) {
        return;
      }
      if (!ensureModelReady()) {
        return;
      }

      try {
        elements.loadingSpinner.classList.add('visible');
        elements.translateBtn.disabled = true;

        const config = await ConfigService.load();
        const translatedText = await ApiService.translate(text, config);
        elements.outputText.value = translatedText.trim();
      } catch (error) {
        console.error('Translation error:', error);
        elements.outputText.value = `翻译失败: ${error.message}`;
      } finally {
        elements.loadingSpinner.classList.remove('visible');
        elements.translateBtn.disabled = false;
        elements.copyBtn.classList.toggle('hidden', !elements.outputText.value.trim());
      }
    }

    function clearText() {
      elements.inputText.value = '';
      elements.outputText.value = '';
      elements.translateBtn.disabled = true;
      elements.clearTextBtn.classList.add('hidden');
      elements.copyBtn.classList.add('hidden');
    }

    async function copyOutput() {
      const text = elements.outputText.value.trim();
      if (!text) {
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        elements.copyBtn.textContent = '已复制';
        setTimeout(() => {
          elements.copyBtn.textContent = '复制';
        }, 1200);
      } catch (error) {
        console.error('复制失败:', error);
      }
    }

    // ==================== 模型测试与保存 ====================

    function resetTestButton() {
      const button = elements.testModelBtn;
      button.disabled = false;
      button.textContent = '测试连接';
      button.classList.remove('is-cancel');
    }

    async function testModelConnection() {
      if (testAbortController) {
        testAbortController.abort();
        return;
      }

      const button = elements.testModelBtn;
      const controller = new AbortController();
      testAbortController = controller;
      const timeoutSec = Math.max(1, Math.round(ApiService.TEST_TIMEOUT_MS / 1000));

      button.disabled = false;
      button.textContent = '取消';
      button.classList.add('is-cancel');
      setTestStatus(`正在测试连接…（${timeoutSec}秒超时）`, 'pending');

      try {
        const entry = buildEditorEntry();
        if (controller.signal.aborted) {
          setTestStatus('已取消测试', 'pending');
          return;
        }
        const result = await ApiService.testConnection(entry, {
          signal: controller.signal,
          timeoutMs: ApiService.TEST_TIMEOUT_MS
        });
        const latency = Math.max(1, result.latencyMs);
        setTestStatus(`连接成功（${latency}ms）`, 'success');
      } catch (error) {
        if (error.code === 'TEST_CANCELLED') {
          setTestStatus(error.message, 'pending');
        } else {
          console.error('Model test failed:', error);
          setTestStatus(error.message || '测试失败', 'error');
        }
      } finally {
        if (testAbortController === controller) {
          testAbortController = null;
        }
        resetTestButton();
        refreshModelBar();
      }
    }

    // 按「服务商 + 模型 ID」自动判断是新增还是更新
    async function saveModelNow() {
      const entry = buildEditorEntry();
      if (entry.serviceType !== 'bing' && !entry.model) {
        setTestStatus('请填写模型 ID', 'error');
        return;
      }

      const idx = workingModels.findIndex((item) => item.id === entry.id);
      if (idx !== -1) {
        workingModels[idx] = entry;
        setTestStatus('已更新现有配置', 'success');
      } else {
        workingModels.push(entry);
        setTestStatus('已添加新配置，可在下方列表手动选择使用', 'success');
      }
      populateModelSelect();
      refreshModelBar();

      const ok = await saveSettings();
      if (ok) {
        const original = elements.saveModelBtn.textContent;
        elements.saveModelBtn.textContent = '已保存 ✓';
        setTimeout(() => {
          elements.saveModelBtn.textContent = original;
        }, 1200);
      }
    }

    // ==================== 模型编辑辅助 ====================

    function toggleApiKeyVisibility(inputElement, buttonElement) {
      const imgElement = buttonElement.querySelector('img');

      if (inputElement.type === 'password') {
        inputElement.type = 'text';
        imgElement.src = 'images/eye.png';
        imgElement.alt = 'Hide';
      } else {
        inputElement.type = 'password';
        imgElement.src = 'images/eye-close.png';
        imgElement.alt = 'Show';
      }
    }

    async function saveSettings() {
      try {
        await ConfigService.save({
          nativeLanguage: elements.nativeLanguage.value,
          models: cloneModels(workingModels),
          currentModelId: selectedModelId,
          translationDisplayMode: elements.translationDisplayMode.value,
          maxApiCalls: clampSetting(elements.maxApiCalls, 20, 50),
          concurrentApiCalls: clampSetting(elements.concurrentApiCalls, 3, 20),
          ignoredPageRegions: collectIgnoredRegions(),
          textSelectionEnabled: elements.textSelectionEnabled.checked,
          selectionOffsetX: clampOffsetSetting(elements.selectionOffsetX),
          selectionOffsetY: clampOffsetSetting(elements.selectionOffsetY)
        });
        return true;
      } catch (error) {
        console.error('Error saving settings:', error);
        UiService.showNotification('保存设置失败: ' + error.message, 'error');
        return false;
      }
    }

    // ==================== 网页翻译 ====================

    async function sendToActiveTab(message) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.id == null) {
        throw new Error('无法获取当前标签页');
      }
      return chrome.tabs.sendMessage(tab.id, message);
    }

    function applyPageState(state, statusText) {
      const has = Boolean(state && state.hasTranslations);
      elements.togglePageBtn.disabled = !has;
      elements.clearWebpageBtn.disabled = !has;
      if (state && state.unavailable) {
        elements.pageStatus.textContent = '无法访问当前页面';
        return;
      }
      elements.togglePageBtn.textContent = state && state.hidden ? '显示译文' : '显示原文';
      if (typeof statusText === 'string') {
        elements.pageStatus.textContent = statusText;
        return;
      }
      if (!has) {
        elements.pageStatus.textContent = '当前页面还没有翻译内容';
        return;
      }
      if (state.hidden) {
        elements.pageStatus.textContent = '已切换为原文';
        return;
      }
      elements.pageStatus.textContent = '';
    }

    async function refreshPagePanel() {
      try {
        const state = await sendToActiveTab({ action: 'getWebpageTranslationState' });
        applyPageState(state);
      } catch (error) {
        console.error('无法读取页面翻译状态:', error);
        applyPageState({ hasTranslations: false, unavailable: true });
      }
    }

    async function translateWebpage() {
      try {
        elements.translateWebpageBtn.disabled = true;
        elements.pageStatus.textContent = '正在翻译当前网页…';

        const state = await sendToActiveTab({ action: 'translateWebpage' });
        if (!state || !state.success) {
          throw new Error((state && state.error) || '翻译请求未成功发送');
        }

        window.close();
      } catch (error) {
        console.error('执行全网页翻译时出错:', error);
        elements.pageStatus.textContent = `翻译失败: ${error.message}`;
        UiService.showNotification(`全网页翻译失败: ${error.message}`, 'error');
      } finally {
        elements.translateWebpageBtn.disabled = false;
      }
    }

    async function togglePageTranslations() {
      try {
        const state = await sendToActiveTab({ action: 'toggleWebpageTranslations' });
        applyPageState(state);
      } catch (error) {
        console.error('切换网页译文显示时出错:', error);
        elements.pageStatus.textContent = '操作失败，请刷新页面后重试';
      }
    }

    async function clearWebpageTranslations() {
      try {
        elements.clearWebpageBtn.disabled = true;
        const state = await sendToActiveTab({ action: 'clearWebpageTranslations' });
        if (!state || !state.success) {
          throw new Error((state && state.error) || '清除请求未成功发送');
        }
        applyPageState(state, '已恢复原文');
      } catch (error) {
        console.error('清除网页翻译时出错:', error);
        elements.pageStatus.textContent = `清除失败: ${error.message}`;
        UiService.showNotification(`清除翻译失败: ${error.message}`, 'error');
        elements.clearWebpageBtn.disabled = false;
      }
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
});
