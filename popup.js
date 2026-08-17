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
        // 模型栏
        modelBar: document.getElementById('modelBar'),
        modelBarName: document.getElementById('modelBarName'),
        modelBarBadge: document.getElementById('modelBarBadge'),
        // 模型设置
        modelSelect: document.getElementById('modelSelect'),
        addModelBtn: document.getElementById('addModelBtn'),
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
        advancedJson: document.getElementById('advancedJson')
      };
    }

    // ==================== 通用辅助 ====================

    function cloneModels(models) {
      return JSON.parse(JSON.stringify(models || []));
    }

    function entryLabel(entry) {
      return ConfigService.displayName(entry);
    }

    function hasApiKey(entry) {
      return Boolean(entry && (entry.apiKey || '').trim());
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

    // ==================== 模型栏 / 面板状态 ====================

    function refreshModelBar() {
      const entry = currentEntry();
      const ready = ConfigService.isModelReady(entry);
      elements.modelBarName.textContent = currentEntryName();
      elements.modelBarBadge.textContent = ready ? '已配置' : '未配置';
      elements.modelBarBadge.classList.toggle('is-ready', ready);
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

    function flushEditorToWorking() {
      const idx = workingModels.findIndex((item) => item.id === selectedModelId);
      if (idx === -1) {
        return;
      }
      const rawJson = elements.modelBodyJson.value.trim();
      workingModels[idx] = {
        ...workingModels[idx],
        id: selectedModelId,
        providerId: elements.modelProvider.value || 'custom',
        baseUrl: elements.modelBaseUrl.value.trim(),
        model: elements.modelName.value.trim(),
        apiKey: elements.modelApiKey.value.trim(),
        bodyJson: rawJson || '{}'
      };
      refreshModelBar();
    }

    function commitIdentity() {
      flushEditorToWorking();
      const idx = workingModels.findIndex((item) => item.id === selectedModelId);
      if (idx === -1) {
        return;
      }

      const entry = workingModels[idx];
      const nextId = ConfigService.identityKey(entry.providerId, entry.model);
      if (nextId === entry.id) {
        const option = elements.modelSelect.querySelector(`option[value="${selectedModelId}"]`);
        if (option) {
          option.textContent = entryLabel(entry);
        }
        return;
      }

      const conflictIdx = workingModels.findIndex((item, index) => index !== idx && item.id === nextId);
      if (conflictIdx !== -1) {
        if (hasApiKey(entry) && !hasApiKey(workingModels[conflictIdx])) {
          workingModels[conflictIdx] = {
            ...workingModels[conflictIdx],
            apiKey: entry.apiKey
          };
        }
        workingModels.splice(idx, 1);
        selectedModelId = nextId;
        setTestStatus('该服务商已有相同模型 ID，已切换到已有配置', 'pending');
      } else {
        workingModels[idx] = { ...entry, id: nextId };
        selectedModelId = nextId;
      }
      populateModelSelect();
    }

    function applyWorkingToEditor(entry) {
      if (!entry) {
        elements.modelProvider.value = 'deepseek';
        elements.modelBaseUrl.value = '';
        elements.modelName.value = '';
        elements.modelApiKey.value = '';
        elements.modelBodyJson.value = '{}';
        elements.modelProviderHint.textContent = ConfigService.getProvider('deepseek').hint;
        elements.advancedJson.open = false;
        refreshModelBar();
        return;
      }

      const providerId = ConfigService.inferProviderId(entry.baseUrl, entry.providerId);
      elements.modelProvider.value = providerId;
      elements.modelBaseUrl.value = entry.baseUrl || '';
      elements.modelName.value = entry.model || '';
      elements.modelApiKey.value = entry.apiKey || '';
      elements.modelBodyJson.value = (entry.bodyJson || '').trim() || '{}';
      elements.modelProviderHint.textContent = ConfigService.getProvider(providerId).hint;
      elements.advancedJson.open = Boolean(entry.bodyJson && entry.bodyJson.trim() && entry.bodyJson.trim() !== '{}');
      refreshModelBar();
    }

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
        applyWorkingToEditor(null);
        elements.removeModelBtn.disabled = true;
        refreshModelBar();
        return;
      }

      elements.removeModelBtn.disabled = false;

      if (!workingModels.some((item) => item.id === selectedModelId)) {
        selectedModelId = workingModels[0].id;
      }

      selectEl.value = selectedModelId;
      applyWorkingToEditor(currentEntry());
    }

    function ensureDefaultModel() {
      if (workingModels.length > 0) {
        return false;
      }
      const created = ConfigService.createModelEntry('deepseek');
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

        const createdDefault = ensureDefaultModel();
        populateModelSelect();

        if (config.nativeLanguage) {
          elements.nativeLanguage.value = config.nativeLanguage;
        }

        if (config.maxApiCalls) {
          elements.maxApiCalls.value = config.maxApiCalls;
        }
        elements.concurrentApiCalls.value = config.concurrentApiCalls || 3;
        elements.translationDisplayMode.value = config.translationDisplayMode || 'bilingual';

        refreshModelBar();

        if (createdDefault) {
          await saveSettings();
        }
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
          clampSetting(field, isMaxCalls ? 10 : 3, isMaxCalls ? 50 : 20);
          saveSettings();
        });
      });

      // 模型设置
      elements.testModelBtn.addEventListener('click', () => testModelConnection());
      elements.saveModelBtn.addEventListener('click', () => saveModelNow());

      elements.showModelKeyBtn.addEventListener('click', () =>
        toggleApiKeyVisibility(elements.modelApiKey, elements.showModelKeyBtn));

      elements.modelSelect.addEventListener('change', () => {
        const nextId = elements.modelSelect.value;
        commitIdentity();
        if (workingModels.some((item) => item.id === nextId)) {
          selectedModelId = nextId;
        }
        applyWorkingToEditor(currentEntry());
        setTestStatus('', '');
        saveSettings();
      });

      elements.modelProvider.addEventListener('change', () => {
        switchProvider(elements.modelProvider.value);
        saveSettings();
      });

      elements.addModelBtn.addEventListener('click', () => {
        commitIdentity();
        const created = ConfigService.nextUnusedEntry(workingModels);
        workingModels.push(created);
        selectedModelId = created.id;
        populateModelSelect();
        setTestStatus('请填写该服务商的 API Key', 'pending');
        saveSettings();
        elements.modelApiKey.focus();
      });

      elements.removeModelBtn.addEventListener('click', () => {
        if (workingModels.length === 0) {
          return;
        }
        if (!window.confirm('确定删除当前模型配置？')) {
          return;
        }
        flushEditorToWorking();
        workingModels = workingModels.filter((item) => item.id !== selectedModelId);
        ensureDefaultModel();
        populateModelSelect();
        setTestStatus('', '');
        saveSettings();
      });

      // 编辑字段：输入自动保存（防抖）
      const autoSaveFields = [
        elements.modelBaseUrl,
        elements.modelApiKey,
        elements.modelBodyJson
      ];
      let saveTimer = null;
      autoSaveFields.forEach((field) => {
        field.addEventListener('input', () => {
          flushEditorToWorking();
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            saveSettings();
          }, 400);
        });
        field.addEventListener('blur', () => {
          clearTimeout(saveTimer);
          flushEditorToWorking();
          saveSettings();
        });
      });

      elements.modelName.addEventListener('input', () => {
        flushEditorToWorking();
      });
      elements.modelName.addEventListener('blur', () => {
        commitIdentity();
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

    async function persistCurrentEditor() {
      commitIdentity();
      return saveSettings();
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

        const saved = await persistCurrentEditor();
        if (!saved) {
          elements.outputText.value = '保存设置失败，请检查配置后重试';
          return;
        }

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
      setTestStatus(`正在请求模型…（${timeoutSec}秒超时）`, 'pending');

      try {
        const saved = await persistCurrentEditor();
        if (controller.signal.aborted) {
          setTestStatus('已取消测试', 'pending');
          return;
        }
        if (!saved) {
          setTestStatus('保存失败，未发起测试', 'error');
          return;
        }

        const entry = currentEntry();
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

    async function saveModelNow() {
      commitIdentity();
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

    function switchProvider(providerId) {
      flushEditorToWorking();
      const provider = ConfigService.getProvider(providerId);
      const previous = currentEntry();
      const existing = ConfigService.findByIdentity(
        workingModels,
        provider.id,
        provider.defaultModel
      );

      if (existing && previous && existing.id === previous.id) {
        applyWorkingToEditor(existing);
        return;
      }

      if (existing) {
        if (previous && !hasApiKey(previous) && previous.id !== existing.id) {
          workingModels = workingModels.filter((item) => item.id !== previous.id);
        }
        selectedModelId = existing.id;
        populateModelSelect();
        setTestStatus('', '');
        return;
      }

      const created = ConfigService.createModelEntry(provider.id);
      if (previous && !hasApiKey(previous)) {
        const idx = workingModels.findIndex((item) => item.id === previous.id);
        if (idx !== -1) {
          workingModels[idx] = created;
        } else {
          workingModels.push(created);
        }
      } else {
        workingModels.push(created);
      }
      selectedModelId = created.id;
      populateModelSelect();
      setTestStatus('已切换服务商，请填写该服务商的 API Key', 'pending');
    }

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
        flushEditorToWorking();
        const config = await ConfigService.load();
        await ConfigService.save({
          ...config,
          nativeLanguage: elements.nativeLanguage.value,
          models: cloneModels(workingModels),
          currentModelId: selectedModelId,
          translationDisplayMode: elements.translationDisplayMode.value,
          maxApiCalls: clampSetting(elements.maxApiCalls, 10, 50),
          concurrentApiCalls: clampSetting(elements.concurrentApiCalls, 3, 20)
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
      if (!ensureModelReady()) {
        return;
      }
      try {
        elements.translateWebpageBtn.disabled = true;
        elements.pageStatus.textContent = '正在翻译当前网页…';

        const saved = await persistCurrentEditor();
        if (!saved) {
          throw new Error('保存设置失败');
        }

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
