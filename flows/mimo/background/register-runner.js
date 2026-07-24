(function attachBackgroundMimoRegisterRunner(root, factory) {
  root.MultiPageBackgroundMimoRegisterRunner = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundMimoRegisterRunnerModule() {
  const MIMO_SIGNUP_URL = 'https://global.account.xiaomi.com/fe/service/register?sid=xiaomichatbot&_locale=zh_TW&_uRegion=US';
  const MIMO_REGISTER_PAGE_SOURCE_ID = 'mimo-register-page';
  const DEFAULT_MIMO_PAGE_TIMEOUT_MS = 90 * 1000;
  const MIMO_VERIFICATION_PAGE_STATE = 'verification_code_entry';
  const MIMO_VERIFICATION_READY_TIMEOUT_MS = 90 * 1000;
  const MIMO_REGISTER_SUBMIT_COMMAND_TIMEOUT_MS = 120 * 1000;
  const MIMO_HUMAN_VERIFICATION_TIMEOUT_MS = 300 * 1000;
  const MIMO_REGISTER_PATHNAME = '/fe/service/register';
  const MIMO_VERIFY_EMAIL_URL_PATTERN = /verifyEmail/i;
  const MIMO_AI_STUDIO_HOST = 'aistudio.xiaomimimo.com';
  const MIMO_AI_STUDIO_LOGIN_URL = 'https://aistudio.xiaomimimo.com/open-apis/v1/genLoginUrl';
  const MIMO_PRE_COOKIE_EXTRACT_WAIT_MS = 10 * 1000;
  const MAIL_2925_FILTER_LOOKBACK_MS = 10 * 60 * 1000;
  // 普通邮箱（如 Hotmail）按“注册提交时间”做时间窗筛选；这里给一个很小的时钟偏差缓冲，
  // 既能容忍本机与邮件服务器之间的轻微时钟漂移，又远小于两次注册之间的间隔，不会把历史旧邮件纳入。
  const MIMO_VERIFICATION_FILTER_BUFFER_MS = 30 * 1000;
  const MIMO_COOKIE_CLEAR_DOMAINS = Object.freeze([
    'xiaomi.com',
    'account.xiaomi.com',
    'global.account.xiaomi.com',
    'mi.com',
    'xiaomimimo.com',
  ]);
  const MIMO_COOKIE_SOURCE_URL = 'https://aistudio.xiaomimimo.com';
  const MIMO_REQUIRED_COOKIE_NAMES = Object.freeze([
    'xiaomichatbot_serviceToken',
    'userId',
    'xiaomichatbot_ph',
  ]);
  const MIMO_COOKIE_WAIT_TIMEOUT_MS = 60 * 1000;

  function cleanString(value = '') {
    return String(value ?? '').trim();
  }

  function getErrorMessage(error) {
    return error instanceof Error ? error.message : cleanString(error) || '未知错误';
  }

  function createGeneratedPassword() {
    const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
    let output = '';
    for (let index = 0; index < 18; index += 1) {
      output += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `${output}aA1!`;
  }

  function createMimoRegisterRunner(deps = {}) {
    const {
      addLog = async () => {},
      chrome = (typeof globalThis !== 'undefined' ? globalThis.chrome : null),
      completeNodeFromBackground,
      ensureContentScriptReadyOnTab = null,
      generatePassword = null,
      getState = async () => ({}),
      getTabId = async () => null,
      isTabAlive = async () => false,
      pollFlowVerificationCode = null,
      registerTab = async () => {},
      resolveSignupEmailForFlow = null,
      reuseOrCreateTab = async () => null,
      sendToContentScriptResilient = null,
      setPasswordState = async () => {},
      setState = async () => {},
      sleepWithStop = async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      },
      throwIfStopped = () => {},
      waitForTabStableComplete = null,
      MIMO_REGISTER_INJECT_FILES = null,
      markCurrentRegistrationAccountUsed = null,
    } = deps;

    if (typeof completeNodeFromBackground !== 'function') {
      throw new Error('Mimo register runner requires completeNodeFromBackground.');
    }

    async function log(message, level = 'info', nodeId = '') {
      await addLog(message, level, nodeId ? { nodeId } : {});
    }

    async function activateTab(tabId) {
      if (!Number.isInteger(tabId) || !chrome?.tabs?.update) {
        return;
      }
      await chrome.tabs.update(tabId, { active: true });
    }

    async function getExecutionState(state = {}) {
      if (state && typeof state === 'object' && !Array.isArray(state) && Object.keys(state).length) {
        return state;
      }
      return getState();
    }

    async function persistState(patch = {}) {
      await setState(patch);
      return patch;
    }

    function buildMimoRuntimePatch(patch = {}) {
      return {
        runtimeState: {
          flowState: {
            mimo: patch,
          },
        },
      };
    }

    async function completeNode(nodeId, patch = {}) {
      await persistState(patch);
      await completeNodeFromBackground(nodeId, patch);
      return patch;
    }

    async function isUsableTabId(tabId) {
      if (!Number.isInteger(tabId)) {
        return false;
      }
      if (typeof isTabAlive === 'function' && await isTabAlive(MIMO_REGISTER_PAGE_SOURCE_ID)) {
        return true;
      }
      if (chrome?.tabs?.get) {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        return Boolean(tab?.id === tabId);
      }
      return true;
    }

    async function ensureMimoRegisterTab(state = {}, options = {}) {
      const existingTabId = Number(
        state?.mimoRegisterTabId
        || state?.runtimeState?.flowState?.mimo?.session?.registerTabId
        || state?.tabRegistry?.[MIMO_REGISTER_PAGE_SOURCE_ID]?.tabId
        || 0
      );
      if (Number.isInteger(existingTabId) && existingTabId > 0 && await isUsableTabId(existingTabId)) {
        await registerTab(MIMO_REGISTER_PAGE_SOURCE_ID, existingTabId);
        return existingTabId;
      }

      const tabId = await getTabId(MIMO_REGISTER_PAGE_SOURCE_ID);
      if (Number.isInteger(tabId) && await isUsableTabId(tabId)) {
        await registerTab(MIMO_REGISTER_PAGE_SOURCE_ID, tabId);
        return tabId;
      }

      if (!options.openIfMissing) {
        throw new Error(options.missingMessage || '缺少小米注册页，请先执行步骤 1。');
      }

      const openedTabId = await reuseOrCreateTab(MIMO_REGISTER_PAGE_SOURCE_ID, MIMO_SIGNUP_URL, {
        inject: Array.isArray(MIMO_REGISTER_INJECT_FILES) ? MIMO_REGISTER_INJECT_FILES : null,
        injectSource: MIMO_REGISTER_PAGE_SOURCE_ID,
      });
      if (!Number.isInteger(openedTabId)) {
        throw new Error('无法打开小米注册页。');
      }
      await registerTab(MIMO_REGISTER_PAGE_SOURCE_ID, openedTabId);
      return openedTabId;
    }

    async function ensureContentReady(tabId, options = {}) {
      if (!Number.isInteger(tabId)) {
        throw new Error('缺少小米注册页标签页，无法连接内容脚本。');
      }
      if (typeof waitForTabStableComplete === 'function') {
        await waitForTabStableComplete(tabId, {
          timeoutMs: options.timeoutMs || DEFAULT_MIMO_PAGE_TIMEOUT_MS,
          retryDelayMs: 300,
          stableMs: Number(options.stableMs) || 1200,
          initialDelayMs: Number(options.initialDelayMs) || 120,
        });
      }
      if (typeof ensureContentScriptReadyOnTab === 'function') {
        await ensureContentScriptReadyOnTab(MIMO_REGISTER_PAGE_SOURCE_ID, tabId, {
          inject: Array.isArray(MIMO_REGISTER_INJECT_FILES) ? MIMO_REGISTER_INJECT_FILES : null,
          injectSource: MIMO_REGISTER_PAGE_SOURCE_ID,
          timeoutMs: options.timeoutMs || DEFAULT_MIMO_PAGE_TIMEOUT_MS,
          retryDelayMs: 700,
          logMessage: options.logMessage || '小米注册页内容脚本未就绪，正在等待页面恢复...',
        });
      }
    }

    async function sendMimoCommand(nodeId, payload = {}, options = {}) {
      if (typeof sendToContentScriptResilient !== 'function') {
        throw new Error('小米注册页通信能力不可用。');
      }
      const result = await sendToContentScriptResilient(MIMO_REGISTER_PAGE_SOURCE_ID, {
        type: 'EXECUTE_NODE',
        nodeId,
        step: options.step || 0,
        source: 'background',
        payload,
      }, {
        timeoutMs: options.timeoutMs || 45000,
        retryDelayMs: 700,
        logMessage: options.logMessage || '',
      });
      if (result?.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    async function getMimoRegisterPageState(options = {}) {
      return sendMimoCommand('GET_PAGE_STATE', {}, {
        step: options.step || 0,
        timeoutMs: options.timeoutMs || 15000,
        logMessage: options.logMessage || '',
      });
    }

    async function waitForMimoVerificationPageReady(tabId, options = {}) {
      const timeoutMs = Math.max(1000, Number(options.timeoutMs) || MIMO_VERIFICATION_READY_TIMEOUT_MS);
      const intervalMs = Math.max(250, Number(options.intervalMs) || 1000);
      const deadline = Date.now() + timeoutMs;
      let lastState = null;
      let lastError = '';

      while (Date.now() <= deadline) {
        throwIfStopped();
        try {
          await ensureContentReady(tabId, {
            timeoutMs: Math.min(DEFAULT_MIMO_PAGE_TIMEOUT_MS, Math.max(5000, intervalMs + 3000)),
            stableMs: 500,
            initialDelayMs: 0,
            logMessage: options.logMessage || '',
          });
          lastState = await getMimoRegisterPageState({
            step: options.step || 0,
            timeoutMs: Math.max(5000, intervalMs + 3000),
          });
          lastError = '';
          if (lastState?.state === MIMO_VERIFICATION_PAGE_STATE) {
            return lastState;
          }
        } catch (error) {
          lastError = getErrorMessage(error);
        }
        await sleepWithStop(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
      }

      const stateLabel = cleanString(lastState?.state) || 'unknown';
      const urlLabel = cleanString(lastState?.url);
      const errorLabel = lastError ? `，最后通信错误：${lastError}` : '';
      throw new Error(`小米账号提交后尚未进入验证码页面，当前状态：${stateLabel}${urlLabel ? `，URL：${urlLabel}` : ''}${errorLabel}。`);
    }

    function getMimoPathname(rawUrl) {
      try {
        return new URL(rawUrl).pathname;
      } catch (_error) {
        return '';
      }
    }

    function getMimoHost(rawUrl) {
      try {
        return new URL(rawUrl).hostname;
      } catch (_error) {
        return '';
      }
    }

    async function waitForMimoRegisterAdvance(tabId, options = {}) {
      const timeoutMs = Math.max(1000, Number(options.timeoutMs) || MIMO_HUMAN_VERIFICATION_TIMEOUT_MS);
      const intervalMs = Math.max(500, Number(options.intervalMs) || 1500);
      const deadline = Date.now() + timeoutMs;
      const nodeId = options.nodeId || 'mimo-submit-register-form';
      let lastState = null;
      let lastError = '';
      let humanLogged = false;

      while (Date.now() <= deadline) {
        throwIfStopped();
        try {
          await ensureContentReady(tabId, {
            timeoutMs: Math.min(DEFAULT_MIMO_PAGE_TIMEOUT_MS, Math.max(5000, intervalMs + 3000)),
            stableMs: 500,
            initialDelayMs: 0,
            logMessage: options.logMessage || '',
          });
          lastState = await getMimoRegisterPageState({
            step: options.step || 0,
            timeoutMs: Math.max(5000, intervalMs + 3000),
          });
          lastError = '';
          const state = cleanString(lastState?.state);
          const url = cleanString(lastState?.url);
          if (state === 'human_verification') {
            if (!humanLogged) {
              await log(`步骤 2：检测到人机验证，请在浏览器中手动完成（最多等待 ${Math.floor(timeoutMs / 1000)} 秒）...`, 'warn', nodeId);
              humanLogged = true;
            }
          } else if (state === MIMO_VERIFICATION_PAGE_STATE || state === 'signed_in') {
            return lastState;
          } else {
            const pathname = getMimoPathname(url);
            const leftRegisterForm = pathname && pathname !== MIMO_REGISTER_PATHNAME;
            if (leftRegisterForm && state !== 'register_form' && state !== 'email_entry') {
              return lastState;
            }
          }
        } catch (error) {
          lastError = getErrorMessage(error);
        }
        await sleepWithStop(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
      }

      const stateLabel = cleanString(lastState?.state) || 'unknown';
      const urlLabel = cleanString(lastState?.url);
      const errorLabel = lastError ? `，最后通信错误：${lastError}` : '';
      throw new Error(`小米注册表单提交后未在 ${Math.floor(timeoutMs / 1000)} 秒内完成人机验证或跳转，当前状态：${stateLabel}${urlLabel ? `，URL：${urlLabel}` : ''}${errorLabel}。`);
    }

    async function waitForMimoCodeSubmitAdvance(tabId, startUrl = '', options = {}) {
      const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 60000);
      const intervalMs = Math.max(500, Number(options.intervalMs) || 1500);
      const deadline = Date.now() + timeoutMs;
      const startNormalized = cleanString(startUrl);
      const label = options.label || '验证码';
      let lastState = null;
      let lastError = '';

      while (Date.now() <= deadline) {
        throwIfStopped();
        try {
          await ensureContentReady(tabId, {
            timeoutMs: Math.min(DEFAULT_MIMO_PAGE_TIMEOUT_MS, Math.max(5000, intervalMs + 3000)),
            stableMs: 500,
            initialDelayMs: 0,
          });
          lastState = await getMimoRegisterPageState({
            step: options.step || 0,
            timeoutMs: Math.max(5000, intervalMs + 3000),
          });
          lastError = '';
          const state = cleanString(lastState?.state);
          const url = cleanString(lastState?.url);
          if (state === 'signed_in') {
            return lastState;
          }
          if (url && startNormalized && url !== startNormalized) {
            return lastState;
          }
          if (state && state !== MIMO_VERIFICATION_PAGE_STATE && state !== 'human_verification') {
            return lastState;
          }
        } catch (error) {
          lastError = getErrorMessage(error);
        }
        await sleepWithStop(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
      }

      const stateLabel = cleanString(lastState?.state) || 'unknown';
      const urlLabel = cleanString(lastState?.url);
      const errorLabel = lastError ? `，最后通信错误：${lastError}` : '';
      throw new Error(`${label}提交后未在 ${Math.floor(timeoutMs / 1000)} 秒内跳转或离开验证码页，当前状态：${stateLabel}${urlLabel ? `，URL：${urlLabel}` : ''}${errorLabel}。可能验证码错误或提交未生效。`);
    }

    function shouldClearMimoCookie(cookie = {}) {
      const domain = cleanString(cookie.domain).replace(/^\.+/, '').toLowerCase();
      return MIMO_COOKIE_CLEAR_DOMAINS.some((target) => (
        domain === target || domain.endsWith(`.${target}`)
      ));
    }

    function buildCookieRemovalUrl(cookie = {}) {
      const host = cleanString(cookie.domain).replace(/^\.+/, '').toLowerCase();
      const path = cleanString(cookie.path) || '/';
      return `https://${host}${path.startsWith('/') ? path : `/${path}`}`;
    }

    async function clearMimoCookiesBeforeStep1() {
      if (!chrome?.cookies?.getAll || !chrome.cookies?.remove) {
        await log('步骤 1：当前浏览器不支持 cookies API，跳过小米 Cookie 清理。', 'warn', 'mimo-open-signup-page');
        return;
      }

      const stores = chrome.cookies.getAllCookieStores
        ? await chrome.cookies.getAllCookieStores()
        : [{ id: undefined }];
      let removedCount = 0;
      const seen = new Set();

      for (const store of stores) {
        const storeId = store?.id;
        const cookies = await chrome.cookies.getAll(storeId ? { storeId } : {}).catch(() => []);
        for (const cookie of cookies || []) {
          if (!shouldClearMimoCookie(cookie)) {
            continue;
          }
          const key = [
            cookie.storeId || storeId || '',
            cookie.domain || '',
            cookie.path || '',
            cookie.name || '',
            cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : '',
          ].join('|');
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          try {
            const details = {
              url: buildCookieRemovalUrl(cookie),
              name: cookie.name,
            };
            if (cookie.storeId) {
              details.storeId = cookie.storeId;
            }
            if (cookie.partitionKey) {
              details.partitionKey = cookie.partitionKey;
            }
            const removed = await chrome.cookies.remove(details);
            if (removed) {
              removedCount += 1;
            }
          } catch (error) {
            console.warn('[MultiPage:mimo-register] remove cookie failed', {
              domain: cookie?.domain,
              name: cookie?.name,
              message: getErrorMessage(error),
            });
          }
        }
      }
      await log(`步骤 1：已清理小米账号 Cookie ${removedCount} 个。`, removedCount ? 'ok' : 'info', 'mimo-open-signup-page');
    }

    function resolvePassword(currentState = {}) {
      return cleanString(currentState.mimoPassword || currentState.customPassword || currentState.password)
        || (typeof generatePassword === 'function' ? generatePassword() : createGeneratedPassword());
    }

    function normalizeMimoVerificationCode(value = '') {
      return cleanString(value).replace(/[^A-Za-z0-9]/g, '');
    }

    async function readMimoCookiesFromChrome() {
      const parts = [];
      const missing = [];
      if (!chrome?.cookies?.get) {
        return { value: '', parts, missing: MIMO_REQUIRED_COOKIE_NAMES.slice() };
      }
      for (const name of MIMO_REQUIRED_COOKIE_NAMES) {
        const cookie = await chrome.cookies.get({ url: MIMO_COOKIE_SOURCE_URL, name }).catch(() => null);
        const value = cleanString(cookie?.value);
        if (value) {
          parts.push(`${name}=${value}`);
        } else {
          missing.push(name);
        }
      }
      return { value: parts.join('; '), parts, missing };
    }

    async function executeMimoOpenSignupPage(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'mimo-open-signup-page';
      const currentState = await getExecutionState(state);
      try {
        await clearMimoCookiesBeforeStep1();
        const tabId = await ensureMimoRegisterTab(currentState, { openIfMissing: true });
        await activateTab(tabId);
        await persistState({
          mimoRegisterTabId: tabId,
          mimoSignupUrl: MIMO_SIGNUP_URL,
          ...buildMimoRuntimePatch({
            session: {
              registerTabId: tabId,
              startedAt: Date.now(),
              pageUrl: MIMO_SIGNUP_URL,
              lastError: '',
            },
          }),
        });
        await ensureContentReady(tabId);
        const result = await sendMimoCommand(nodeId, {}, {
          step: 1,
          timeoutMs: DEFAULT_MIMO_PAGE_TIMEOUT_MS,
          logMessage: '步骤 1：正在打开小米注册入口...',
        });
        await log('步骤 1：已打开小米注册页。', 'ok', nodeId);
        await completeNode(nodeId, {
          mimoRegisterTabId: tabId,
          mimoPageState: result.state || 'register_form_ready',
          mimoPageUrl: result.url || MIMO_SIGNUP_URL,
          ...buildMimoRuntimePatch({
            session: {
              registerTabId: tabId,
              startedAt: Date.now(),
              pageState: result.state || 'register_form_ready',
              pageUrl: result.url || MIMO_SIGNUP_URL,
              lastError: '',
            },
            register: {
              status: 'signup_page_opened',
            },
          }),
        });
      } catch (error) {
        const message = getErrorMessage(error);
        await persistState(buildMimoRuntimePatch({
          session: {
            lastError: message,
          },
        }));
        await log(`步骤 1：${message}`, 'error', nodeId);
        throw error;
      }
    }

    async function executeMimoSubmitRegisterForm(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'mimo-submit-register-form';
      const currentState = await getExecutionState(state);
      try {
        if (typeof resolveSignupEmailForFlow !== 'function') {
          throw new Error('小米账号步骤缺少公共邮箱解析能力，无法继续执行。');
        }
        const tabId = await ensureMimoRegisterTab(currentState, { openIfMissing: false });
        await activateTab(tabId);
        await ensureContentReady(tabId);
        const resolvedEmail = await resolveSignupEmailForFlow(currentState, {
          preserveAccountIdentity: true,
        });
        const email = cleanString(resolvedEmail).toLowerCase();
        if (!email) {
          throw new Error('小米注册邮箱为空，无法继续执行。');
        }
        const password = resolvePassword(currentState);
        const requestedAt = Date.now();
        if (typeof setPasswordState === 'function') {
          await setPasswordState(password);
        }
        await persistState({
          mimoEmail: email,
          mimoPassword: password,
          email,
          accountIdentifierType: 'email',
          accountIdentifier: email,
          ...buildMimoRuntimePatch({
            register: {
              email,
              password,
              verificationRequestedAt: requestedAt,
              status: 'register_form_submitting',
            },
          }),
        });
        await sendMimoCommand(nodeId, { email, password }, {
          step: 2,
          timeoutMs: MIMO_REGISTER_SUBMIT_COMMAND_TIMEOUT_MS,
          logMessage: '步骤 2：正在勾选协议并填写小米账号、密码...',
        });
        const advancedState = await waitForMimoRegisterAdvance(tabId, {
          nodeId,
          step: 2,
          logMessage: '步骤 2：正在等待人机验证完成与页面跳转...',
        });
        await log(`步骤 2：已提交小米注册表单 ${email}，并完成人机验证/跳转。`, 'ok', nodeId);
        await completeNode(nodeId, {
          mimoEmail: email,
          mimoPassword: password,
          mimoVerificationRequestedAt: requestedAt,
          mimoPageState: advancedState.state || '',
          mimoPageUrl: advancedState.url || '',
          email,
          accountIdentifierType: 'email',
          accountIdentifier: email,
          ...buildMimoRuntimePatch({
            session: {
              pageState: advancedState.state || '',
              pageUrl: advancedState.url || '',
              lastError: '',
            },
            register: {
              email,
              password,
              verificationRequestedAt: requestedAt,
              status: 'verification_requested',
            },
          }),
        });
      } catch (error) {
        const message = getErrorMessage(error);
        await persistState(buildMimoRuntimePatch({
          session: {
            lastError: message,
          },
          register: {
            status: 'error',
          },
        }));
        await log(`步骤 2：${message}`, 'error', nodeId);
        throw error;
      }
    }

    async function executeMimoSubmitVerificationCode(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'mimo-submit-verification-code';
      const currentState = await getExecutionState(state);
      try {
        if (typeof pollFlowVerificationCode !== 'function') {
          throw new Error('小米验证码步骤缺少共享邮件轮询能力，无法继续执行。');
        }
        const requestedAt = Math.max(
          0,
          Number(
            currentState.mimoVerificationRequestedAt
            || currentState.runtimeState?.flowState?.mimo?.register?.verificationRequestedAt
          ) || Date.now()
        );
        const filterAfterTimestamp = cleanString(currentState?.mailProvider).toLowerCase() === '2925'
          ? Math.max(0, requestedAt - MAIL_2925_FILTER_LOOKBACK_MS)
          : Math.max(0, requestedAt - MIMO_VERIFICATION_FILTER_BUFFER_MS);
        const email = cleanString(
          currentState.mimoEmail
          || currentState.runtimeState?.flowState?.mimo?.register?.email
          || currentState.email
        ).toLowerCase();
        const tabId = await ensureMimoRegisterTab(currentState, { openIfMissing: false });
        await activateTab(tabId);
        const readyState = await waitForMimoVerificationPageReady(tabId, {
          step: 3,
          logMessage: '步骤 3：正在等待小米验证码页面就绪...',
        });
        await persistState({
          mimoPageState: readyState.state || '',
          mimoPageUrl: readyState.url || '',
          ...buildMimoRuntimePatch({
            session: {
              pageState: readyState.state || '',
              pageUrl: readyState.url || '',
              lastError: '',
            },
          }),
        });
        const pollResult = await pollFlowVerificationCode({
          actionLabel: '小米验证码',
          filterAfterTimestamp,
          flowId: 'mimo',
          logStep: 3,
          logStepKey: nodeId,
          nodeId,
          notFoundMessage: '步骤 3：邮箱轮询结束，但未获取到小米验证码。',
          state: {
            ...currentState,
            activeFlowId: 'mimo',
            flowId: 'mimo',
            visibleStep: 3,
            mimoEmail: email,
            email,
          },
          step: 3,
        });
        const code = normalizeMimoVerificationCode(pollResult?.code);
        if (!code) {
          throw new Error('未能获取到小米邮箱验证码。');
        }
        await activateTab(tabId);
        await ensureContentReady(tabId);
        const codePageUrl = cleanString(readyState?.url);
        try {
          await sendMimoCommand(nodeId, { code }, {
            step: 3,
            timeoutMs: 8000,
            logMessage: '步骤 3：正在填写小米邮箱验证码...',
          });
        } catch (error) {
          // 提交后小米通常整页跳转，内容脚本被销毁会导致响应丢失/超时；一律容忍，成败由下面的页面状态轮询判定
          await log(`步骤 3：提交验证码后页面已跳转或通信中断，按页面状态继续判定（${getErrorMessage(error)}）。`, 'info', nodeId);
        }
        const advancedState = await waitForMimoCodeSubmitAdvance(tabId, codePageUrl, {
          step: 3,
          nodeId,
          label: '小米邮箱验证码',
        });
        await log(`步骤 3：已提交小米邮箱验证码并跳转，当前页面状态：${advancedState.state || 'unknown'}。`, 'ok', nodeId);
        await completeNode(nodeId, {
          mimoVerificationCode: code,
          mimoVerificationRawCode: cleanString(pollResult?.code),
          mimoVerificationMessageId: cleanString(pollResult?.messageId || pollResult?.mailId),
          mimoPageState: advancedState.state || '',
          mimoPageUrl: advancedState.url || '',
          ...buildMimoRuntimePatch({
            session: {
              pageState: advancedState.state || '',
              pageUrl: advancedState.url || '',
              lastError: '',
            },
            register: {
              verificationCode: code,
              status: 'verified',
            },
          }),
        });
      } catch (error) {
        const message = getErrorMessage(error);
        await persistState(buildMimoRuntimePatch({
          session: {
            lastError: message,
          },
          register: {
            status: 'error',
          },
        }));
        await log(`步骤 3：${message}`, 'error', nodeId);
        throw error;
      }
    }

    async function executeMimoExtractCookie(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'mimo-extract-cookie';
      const currentState = await getExecutionState(state);
      try {
        const tabId = await ensureMimoRegisterTab(currentState, { openIfMissing: false });
        await activateTab(tabId);
        await log(`步骤 6：等待 ${Math.floor(MIMO_PRE_COOKIE_EXTRACT_WAIT_MS / 1000)} 秒后提取小米登录 Cookie...`, 'info', nodeId);
        await sleepWithStop(MIMO_PRE_COOKIE_EXTRACT_WAIT_MS);

        const cookieDeadline = Date.now() + MIMO_COOKIE_WAIT_TIMEOUT_MS;
        let cookieResult = await readMimoCookiesFromChrome();
        while (cookieResult.missing.length && Date.now() <= cookieDeadline) {
          throwIfStopped();
          await sleepWithStop(2000);
          cookieResult = await readMimoCookiesFromChrome();
        }
        const cookieValue = cleanString(cookieResult.value);
        if (cookieResult.missing.length || !cookieValue) {
          throw new Error(`未找到完整的小米登录 Cookie，缺少：${(cookieResult.missing || []).join('、') || 'unknown'}。`);
        }

        const completedAt = Date.now();
        const completionPatch = {
          mimoCookie: cookieValue,
          mimoCookies: cookieResult.parts,
          mimoCookieExtractedAt: completedAt,
          mimoCompletedAt: completedAt,
          mimoRegisterStatus: 'completed',
          mimoUploadStatus: '',
          mimoUploadedAt: 0,
          mimoUploadMessage: '',
          mimoUploadTargetUrl: '',
          ...buildMimoRuntimePatch({
            register: {
              status: 'completed',
              completedAt,
            },
            cookie: {
              currentCookie: cookieValue,
              cookies: cookieResult.parts,
              extractedAt: completedAt,
            },
            upload: {
              status: '',
              uploadedAt: 0,
              message: '',
              targetUrl: '',
            },
            session: {
              lastError: '',
            },
          }),
        };
        if (typeof markCurrentRegistrationAccountUsed === 'function') {
          await markCurrentRegistrationAccountUsed({
            ...currentState,
            ...completionPatch,
          }, {
            logPrefix: '小米注册成功',
            level: 'ok',
          });
        }
        await log('步骤 6：已提取小米登录 Cookie。', 'ok', nodeId);
        await completeNode(nodeId, completionPatch);
      } catch (error) {
        const message = getErrorMessage(error);
        await persistState(buildMimoRuntimePatch({
          session: {
            lastError: message,
          },
          register: {
            status: 'error',
          },
        }));
        await log(`步骤 6：${message}`, 'error', nodeId);
        throw error;
      }
    }

    async function executeMimoVerifyEmail(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'mimo-verify-email';
      const currentState = await getExecutionState(state);
      try {
        const tabId = await ensureMimoRegisterTab(currentState, { openIfMissing: false });
        await activateTab(tabId);
        await ensureContentReady(tabId);
        const pageState = await getMimoRegisterPageState({ step: 4 });
        const url = cleanString(pageState?.url);
        if (!MIMO_VERIFY_EMAIL_URL_PATTERN.test(url)) {
          await log('步骤 4：当前页面无需二次邮箱验证（URL 不含 verifyEmail），跳过。', 'info', nodeId);
          await completeNode(nodeId, {
            mimoPageState: pageState?.state || '',
            mimoPageUrl: url,
            ...buildMimoRuntimePatch({
              session: {
                pageState: pageState?.state || '',
                pageUrl: url,
                lastError: '',
              },
            }),
          });
          return;
        }
        if (typeof pollFlowVerificationCode !== 'function') {
          throw new Error('小米二次邮箱验证缺少共享邮件轮询能力，无法继续执行。');
        }
        const requestedAt = Date.now();
        await sendMimoCommand('mimo-verify-email-send', {}, {
          step: 4,
          logMessage: '步骤 4：正在点击发送二次验证邮件...',
        });
        await persistState({
          mimoVerificationRequestedAt: requestedAt,
          ...buildMimoRuntimePatch({
            session: {
              pageState: pageState?.state || '',
              pageUrl: url,
              lastError: '',
            },
            register: {
              verificationRequestedAt: requestedAt,
              status: 'second_verification_requested',
            },
          }),
        });
        const email = cleanString(
          currentState.mimoEmail
          || currentState.runtimeState?.flowState?.mimo?.register?.email
          || currentState.email
        ).toLowerCase();
        const previousCode = normalizeMimoVerificationCode(
          currentState.mimoVerificationCode
          || currentState.runtimeState?.flowState?.mimo?.register?.verificationCode
        );
        const filterAfterTimestamp = cleanString(currentState?.mailProvider).toLowerCase() === '2925'
          ? Math.max(0, requestedAt - MAIL_2925_FILTER_LOOKBACK_MS)
          : Math.max(0, requestedAt - MIMO_VERIFICATION_FILTER_BUFFER_MS);
        const pollResult = await pollFlowVerificationCode({
          actionLabel: '小米二次邮箱验证码',
          filterAfterTimestamp,
          flowId: 'mimo',
          logStep: 4,
          logStepKey: nodeId,
          nodeId,
          notFoundMessage: '步骤 4：邮箱轮询结束，但未获取到新的二次邮箱验证码。',
          payloadOverrides: {
            excludeCodes: previousCode ? [previousCode] : [],
            maxAttempts: 10,
          },
          state: {
            ...currentState,
            activeFlowId: 'mimo',
            flowId: 'mimo',
            visibleStep: 4,
            mimoEmail: email,
            email,
          },
          step: 4,
        });
        const code = normalizeMimoVerificationCode(pollResult?.code);
        if (!code || (previousCode && code === previousCode)) {
          throw new Error('未能获取到新的二次邮箱验证码（仅收到与第一次相同的旧验证码，请确认已发送二次验证邮件）。');
        }
        await activateTab(tabId);
        await ensureContentReady(tabId);
        try {
          await sendMimoCommand('mimo-submit-verification-code', { code }, {
            step: 4,
            timeoutMs: 8000,
            logMessage: '步骤 4：正在填写二次邮箱验证码...',
          });
        } catch (error) {
          await log(`步骤 4：提交二次验证码后页面已跳转或通信中断，按页面状态继续判定（${getErrorMessage(error)}）。`, 'info', nodeId);
        }
        const advancedState = await waitForMimoCodeSubmitAdvance(tabId, url, {
          step: 4,
          nodeId,
          label: '小米二次邮箱验证码',
        });
        await log(`步骤 4：已提交二次邮箱验证码并跳转，当前页面状态：${advancedState.state || 'unknown'}。`, 'ok', nodeId);
        await completeNode(nodeId, {
          mimoVerificationCode: code,
          mimoPageState: advancedState.state || '',
          mimoPageUrl: advancedState.url || '',
          ...buildMimoRuntimePatch({
            session: {
              pageState: advancedState.state || '',
              pageUrl: advancedState.url || '',
              lastError: '',
            },
            register: {
              verificationCode: code,
              status: 'second_verified',
            },
          }),
        });
      } catch (error) {
        const message = getErrorMessage(error);
        await persistState(buildMimoRuntimePatch({
          session: {
            lastError: message,
          },
          register: {
            status: 'error',
          },
        }));
        await log(`步骤 4：${message}`, 'error', nodeId);
        throw error;
      }
    }

    async function executeMimoGotoAiStudio(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'mimo-goto-ai-studio';
      const currentState = await getExecutionState(state);
      try {
        const tabId = await ensureMimoRegisterTab(currentState, { openIfMissing: false });
        await activateTab(tabId);
        let currentUrl = cleanString(
          currentState.mimoPageUrl
          || currentState.runtimeState?.flowState?.mimo?.session?.pageUrl
        );
        try {
          await ensureContentReady(tabId);
          const pageState = await getMimoRegisterPageState({ step: 5 });
          if (cleanString(pageState?.url)) {
            currentUrl = cleanString(pageState.url);
          }
        } catch (_error) {
          /* 读取页面状态失败也继续尝试跳转 */
        }
        if (getMimoHost(currentUrl) === MIMO_AI_STUDIO_HOST) {
          await log('步骤 5：当前已在 AI Studio 页面，无需跳转。', 'info', nodeId);
        } else {
          await log('步骤 5：正在跳转到 AI Studio 登录链接...', 'info', nodeId);
          if (chrome?.tabs?.update) {
            await chrome.tabs.update(tabId, { url: MIMO_AI_STUDIO_LOGIN_URL });
          }
          if (typeof waitForTabStableComplete === 'function') {
            await waitForTabStableComplete(tabId, {
              timeoutMs: DEFAULT_MIMO_PAGE_TIMEOUT_MS,
              retryDelayMs: 300,
              stableMs: 1200,
              initialDelayMs: 120,
            });
          }
        }
        await log('步骤 5：已到达 AI Studio。', 'ok', nodeId);
        // 首次登录 AI Studio 会弹出用户协议：自动勾选并点击确定
        try {
          await ensureContentReady(tabId, {
            logMessage: 'AI Studio 页面内容脚本未就绪，正在等待页面恢复...',
          });
          const agreementResult = await sendMimoCommand('mimo-confirm-ai-studio-agreement', {}, {
            step: 5,
            timeoutMs: 40000,
          });
          if (agreementResult?.agreed) {
            await log('步骤 5：已自动同意 AI Studio 用户协议。', 'ok', nodeId);
          }
        } catch (agreementError) {
          // 协议弹窗可能未出现或结构变化，记录告警但不阻断后续 Cookie 提取
          await log(`步骤 5：自动同意协议未完成：${getErrorMessage(agreementError)}`, 'warn', nodeId);
        }
        await completeNode(nodeId, {
          mimoPageUrl: MIMO_AI_STUDIO_LOGIN_URL,
          ...buildMimoRuntimePatch({
            session: {
              pageUrl: MIMO_AI_STUDIO_LOGIN_URL,
              lastError: '',
            },
          }),
        });
      } catch (error) {
        const message = getErrorMessage(error);
        await persistState(buildMimoRuntimePatch({
          session: {
            lastError: message,
          },
        }));
        await log(`步骤 5：${message}`, 'error', nodeId);
        throw error;
      }
    }

    return {
      executeMimoExtractCookie,
      executeMimoGotoAiStudio,
      executeMimoOpenSignupPage,
      executeMimoSubmitRegisterForm,
      executeMimoSubmitVerificationCode,
      executeMimoVerifyEmail,
    };
  }

  return {
    DEFAULT_MIMO_PAGE_TIMEOUT_MS,
    MIMO_COOKIE_CLEAR_DOMAINS,
    MIMO_PRE_COOKIE_EXTRACT_WAIT_MS,
    MIMO_REGISTER_PAGE_SOURCE_ID,
    MIMO_REGISTER_SUBMIT_COMMAND_TIMEOUT_MS,
    MIMO_SIGNUP_URL,
    createMimoRegisterRunner,
  };
});
