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

    const elements = getDomElements();

    await loadSettings(elements);
    setupEventListeners(elements);
    await checkForSelectedText(elements);

    function getDomElements() {
      return {
        inputText: document.getElementById('inputText'),
        outputText: document.getElementById('outputText'),
        translateBtn: document.getElementById('translateBtn'),
        translateWebpageBtn: document.getElementById('translateWebpageBtn'),
        clearTranslationsBtn: document.getElementById('clearTranslationsBtn'),
        modelSelect: document.getElementById('modelSelect'),
        addModelBtn: document.getElementById('addModelBtn'),
        removeModelBtn: document.getElementById('removeModelBtn'),
        modelLabel: document.getElementById('modelLabel'),
        modelBaseUrl: document.getElementById('modelBaseUrl'),
        modelName: document.getElementById('modelName'),
        modelApiKey: document.getElementById('modelApiKey'),
        modelBodyJson: document.getElementById('modelBodyJson'),
        showModelKeyBtn: document.getElementById('showModelKeyBtn'),
        nativeLanguage: document.getElementById('nativeLanguage'),
        loadingSpinner: document.getElementById('loadingSpinner'),
        modelSectionHeader: document.getElementById('modelSectionHeader'),
        modelSectionContent: document.getElementById('modelSectionContent')
      };
    }

    function cloneModels(models) {
      return JSON.parse(JSON.stringify(models || []));
    }

    function entryLabel(entry) {
      const fromLabel = (entry.label || '').trim();
      if (fromLabel) {
        return fromLabel;
      }
      const fromModel = (entry.model || '').trim();
      if (fromModel) {
        return fromModel;
      }
      return entry.id;
    }

    function flushEditorToWorking(elements) {
      const idx = workingModels.findIndex((m) => m.id === selectedModelId);
      if (idx === -1) {
        return;
      }
      const rawJson = elements.modelBodyJson.value.trim();
      workingModels[idx] = {
        id: selectedModelId,
        label: elements.modelLabel.value.trim(),
        baseUrl: elements.modelBaseUrl.value.trim(),
        model: elements.modelName.value.trim(),
        apiKey: elements.modelApiKey.value.trim(),
        bodyJson: rawJson || '{}'
      };

      const opt = elements.modelSelect.querySelector(`option[value="${selectedModelId}"]`);
      if (opt) {
        opt.textContent = entryLabel(workingModels[idx]);
      }
    }

    function applyWorkingToEditor(elements, entry) {
      if (!entry) {
        elements.modelLabel.value = '';
        elements.modelBaseUrl.value = '';
        elements.modelName.value = '';
        elements.modelApiKey.value = '';
        elements.modelBodyJson.value = '{}';
        return;
      }
      elements.modelLabel.value = entry.label || '';
      elements.modelBaseUrl.value = entry.baseUrl || '';
      elements.modelName.value = entry.model || '';
      elements.modelApiKey.value = entry.apiKey || '';
      elements.modelBodyJson.value = (entry.bodyJson || '').trim() || '{}';
    }

    function populateModelSelect(elements) {
      const selectEl = elements.modelSelect;
      selectEl.innerHTML = '';

      workingModels.forEach((m) => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = entryLabel(m);
        selectEl.appendChild(option);
      });

      if (workingModels.length === 0) {
        selectedModelId = '';
        applyWorkingToEditor(elements, null);
        elements.removeModelBtn.disabled = true;
        return;
      }

      elements.removeModelBtn.disabled = false;

      if (!workingModels.some((m) => m.id === selectedModelId)) {
        selectedModelId = workingModels[0].id;
      }

      selectEl.value = selectedModelId;
      const current = workingModels.find((m) => m.id === selectedModelId);
      applyWorkingToEditor(elements, current);
    }

    async function loadSettings(elements) {
      try {
        console.log('Loading settings...');
        const config = await ConfigService.load();

        workingModels = cloneModels(config.models);
        selectedModelId = config.currentModelId || '';

        console.log('Settings loaded:', JSON.stringify({
          modelsCount: workingModels.length,
          currentModelId: selectedModelId
        }));

        populateLanguageSelect(elements.nativeLanguage);

        populateModelSelect(elements);

        if (config.nativeLanguage) {
          elements.nativeLanguage.value = config.nativeLanguage;
        }

        elements.translateBtn.disabled = !elements.inputText.value.trim();
      } catch (error) {
        console.error('Error loading settings:', error);
        UiService.showNotification('Error loading settings: ' + error.message, 'error');
      }
    }

    function populateLanguageSelect(selectElement) {
      selectElement.innerHTML = '';
      const languages = Utils.getSupportedLanguagesInEnglish();
      languages.forEach((lang) => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        selectElement.appendChild(option);
      });
    }

    function setupEventListeners(elements) {
      elements.translateBtn.addEventListener('click', () => translateText(elements));

      elements.translateWebpageBtn.addEventListener('click', () => translateWebpage(elements));

      elements.clearTranslationsBtn.addEventListener('click', () => clearWebpageTranslations(elements));

      elements.showModelKeyBtn.addEventListener('click', () =>
        toggleApiKeyVisibility(elements.modelApiKey, elements.showModelKeyBtn));

      elements.inputText.addEventListener('input', () => {
        const text = elements.inputText.value.trim();
        elements.translateBtn.disabled = !text;
      });

      elements.nativeLanguage.addEventListener('change', () => {
        elements.nativeLanguage.classList.add('highlight-selection');
        setTimeout(() => {
          elements.nativeLanguage.classList.remove('highlight-selection');
        }, 1000);
        saveSettings(elements);
      });

      elements.modelSelect.addEventListener('change', () => {
        flushEditorToWorking(elements);
        selectedModelId = elements.modelSelect.value;
        const entry = workingModels.find((m) => m.id === selectedModelId);
        applyWorkingToEditor(elements, entry);
        saveSettings(elements);
      });

      elements.addModelBtn.addEventListener('click', () => {
        flushEditorToWorking(elements);
        const id = ConfigService.newModelId();
        workingModels.push({
          id,
          label: '',
          baseUrl: '',
          model: '',
          apiKey: '',
          bodyJson: '{}'
        });
        selectedModelId = id;
        populateModelSelect(elements);
        saveSettings(elements);
      });

      elements.removeModelBtn.addEventListener('click', () => {
        if (workingModels.length === 0) {
          return;
        }
        flushEditorToWorking(elements);
        workingModels = workingModels.filter((m) => m.id !== selectedModelId);
        if (workingModels.length === 0) {
          selectedModelId = '';
        } else {
          selectedModelId = workingModels[0].id;
        }
        populateModelSelect(elements);
        saveSettings(elements);
      });

      const editorFields = [
        elements.modelLabel,
        elements.modelBaseUrl,
        elements.modelName,
        elements.modelApiKey,
        elements.modelBodyJson
      ];
      editorFields.forEach((el) => {
        el.addEventListener('blur', () => {
          flushEditorToWorking(elements);
          saveSettings(elements);
        });
      });

      elements.modelSectionHeader.addEventListener('click', () => {
        toggleCollapse(elements.modelSectionHeader, elements.modelSectionContent);
      });
    }

    function toggleCollapse(headerElement, contentElement) {
      const isExpanded = contentElement.classList.contains('expanded');

      if (isExpanded) {
        headerElement.classList.remove('expanded');
        contentElement.classList.remove('expanded');
        setTimeout(() => {
          contentElement.classList.add('hidden');
        }, 300);
      } else {
        contentElement.classList.remove('hidden');
        setTimeout(() => {
          headerElement.classList.add('expanded');
          contentElement.classList.add('expanded');
        }, 10);
      }
    }

    async function checkForSelectedText(elements) {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' }, function(response) {
          if (response && response.selectedText) {
            elements.inputText.value = response.selectedText;
            elements.translateBtn.disabled = false;
          }
        });
      } catch (error) {
        console.error('Error getting selected text:', error);
      }
    }

    async function translateText(elements) {
      console.log('Starting translation...');
      const text = elements.inputText.value.trim();

      if (!text) {
        console.log('No input text, translation cancelled');
        return;
      }

      try {
        elements.loadingSpinner.classList.add('visible');
        elements.translateBtn.disabled = true;

        flushEditorToWorking(elements);
        await saveSettings(elements);

        const config = await ConfigService.load();

        try {
          const translatedText = await ApiService.translate(text, config);
          elements.outputText.value = translatedText.trim();
        } catch (error) {
          console.error('Translation error:', error);
          elements.outputText.value = `Translation error: ${error.message}`;
        }
      } catch (error) {
        console.error('Translation error:', error);
        elements.outputText.value = `Translation error: ${error.message}`;
      } finally {
        elements.loadingSpinner.classList.remove('visible');
        elements.translateBtn.disabled = false;
      }
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

    async function saveSettings(elements) {
      try {
        flushEditorToWorking(elements);

        const config = await ConfigService.load();
        const nativeLanguage = elements.nativeLanguage.value;

        await ConfigService.save({
          ...config,
          nativeLanguage,
          models: cloneModels(workingModels),
          currentModelId: selectedModelId
        });

        console.log('设置已自动保存');
      } catch (error) {
        console.error('Error saving settings:', error);
      }
    }

    async function translateWebpage(elements) {
      try {
        elements.translateWebpageBtn.disabled = true;
        elements.translateWebpageBtn.textContent = 'Translating...';

        flushEditorToWorking(elements);
        await saveSettings(elements);

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!activeTab) {
          throw new Error('无法获取当前标签页');
        }

        console.log('发送全网页翻译请求到内容脚本');

        const response = await chrome.tabs.sendMessage(activeTab.id, {
          action: 'translateWebpage'
        });

        if (!response || !response.success) {
          throw new Error('翻译请求未成功发送');
        }

        window.close();
      } catch (error) {
        console.error('执行全网页翻译时出错:', error);
        UiService.showNotification(`全网页翻译失败: ${error.message}`, 'error');

        elements.translateWebpageBtn.disabled = false;
        elements.translateWebpageBtn.textContent = 'Page';
      }
    }

    async function clearWebpageTranslations(elements) {
      try {
        elements.clearTranslationsBtn.disabled = true;
        elements.clearTranslationsBtn.textContent = 'Clearing...';

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!activeTab) {
          throw new Error('无法获取当前标签页');
        }

        console.log('发送清除翻译请求到内容脚本');

        const response = await chrome.tabs.sendMessage(activeTab.id, {
          action: 'clearWebpageTranslations'
        });

        if (!response || !response.success) {
          throw new Error('清除请求未成功发送');
        }

        window.close();
      } catch (error) {
        console.error('清除网页翻译时出错:', error);
        UiService.showNotification(`清除翻译失败: ${error.message}`, 'error');

        elements.clearTranslationsBtn.disabled = false;
        elements.clearTranslationsBtn.textContent = 'Clear';
      }
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
});
