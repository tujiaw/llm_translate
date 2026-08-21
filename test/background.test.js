import test from 'node:test';
import assert from 'node:assert/strict';

const bingConfig = {
  nativeLanguage: 'zh',
  models: [{
    id: 'bing::',
    providerId: 'bing',
    serviceType: 'bing',
    baseUrl: '',
    model: '',
    apiKey: '',
    bodyJson: '{}'
  }],
  currentModelId: 'bing::'
};

test('a selection translation uses one configuration snapshot', async () => {
  let storageReads = 0;
  let messageListener;
  let translatedMessage;

  globalThis.chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    },
    storage: {
      local: {
        get(_defaults, callback) {
          storageReads += 1;
          callback(bingConfig);
        },
        set(_payload, callback) {
          callback();
        }
      }
    },
    contextMenus: {
      removeAll(callback) {
        callback();
      },
      create() {},
      onClicked: { addListener() {} }
    },
    tabs: {
      sendMessage(_tabId, message) {
        translatedMessage = message;
      }
    }
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [{ translations: [{ text: '你好' }] }];
    }
  });

  await import(`../background.js?test=${Date.now()}`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  storageReads = 0;

  messageListener(
    { action: 'performTranslation', text: 'hello' },
    { tab: { id: 7 } },
    () => {}
  );

  await assert.doesNotReject(async () => {
    for (let attempt = 0; attempt < 20 && !translatedMessage; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
  assert.equal(translatedMessage?.result, '你好');
  assert.equal(storageReads, 1);
});
