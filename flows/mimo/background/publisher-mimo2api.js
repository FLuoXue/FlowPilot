(function attachBackgroundMimoPublisherMimo2Api(root, factory) {
  root.MultiPageBackgroundMimoPublisherMimo2Api = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundMimoPublisherMimo2ApiModule(root) {
  const mimoStateApi = root?.MultiPageBackgroundMimoState || null;
  const MIMO2API_ACCOUNTS_PATH = '/admin/api/accounts';

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => cloneValue(entry));
    }
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [key, cloneValue(entryValue)])
      );
    }
    return value;
  }

  function deepMerge(baseValue, patchValue) {
    if (Array.isArray(patchValue)) {
      return patchValue.map((entry) => cloneValue(entry));
    }
    if (!isPlainObject(patchValue)) {
      return patchValue === undefined ? cloneValue(baseValue) : patchValue;
    }
    const baseObject = isPlainObject(baseValue) ? baseValue : {};
    const next = { ...cloneValue(baseObject) };
    Object.entries(patchValue).forEach(([key, value]) => {
      next[key] = deepMerge(baseObject[key], value);
    });
    return next;
  }

  function cleanString(value = '') {
    return String(value ?? '').trim();
  }

  function stripCookieQuotes(value = '') {
    const text = cleanString(value);
    // RFC 6265 允许 cookie 值用成对双引号包裹（cookie-value = DQUOTE *cookie-octet DQUOTE），
    // 小米的 serviceToken / xiaomichatbot_ph 正是被服务端这样下发的。chrome.cookies.get 会把引号
    // 原样带回；旧的 Cookie 头鉴权时引号无所谓，但现在要作为 JSON 字段单独上传，必须取引号内的真实
    // token，否则 mimo2api 收到的值会多一层引号导致校验失败。
    if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
      return text.slice(1, -1);
    }
    return text;
  }

  function getErrorMessage(error) {
    return error instanceof Error ? error.message : cleanString(error) || '未知错误';
  }

  async function readResponse(response) {
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_error) {
      json = null;
    }
    return { text, json };
  }

  function readMimo2ApiResponseMessage(body = {}, fallback = '') {
    return cleanString(
      body?.json?.error?.message
      || body?.json?.error
      || body?.json?.message
      || body?.json?.msg
      || fallback
    );
  }

  function normalizeMimo2ApiBaseUrl(value = '') {
    const rawUrl = cleanString(value);
    if (!rawUrl) {
      throw new Error('缺少 mimo2api 地址。');
    }
    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    let parsed = null;
    try {
      parsed = new URL(withProtocol);
    } catch (_error) {
      throw new Error('mimo2api 地址格式无效，请检查配置。');
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error('mimo2api 地址只支持 http 或 https。');
    }
    return parsed.origin;
  }

  function readMimoRuntime(state = {}) {
    return mimoStateApi?.ensureRuntimeState
      ? mimoStateApi.ensureRuntimeState(state)
      : (isPlainObject(state?.runtimeState?.flowState?.mimo)
        ? state.runtimeState.flowState.mimo
        : (isPlainObject(state?.flowState?.mimo) ? state.flowState.mimo : {}));
  }

  function buildCanonicalRuntimePatch(currentState = {}, nextRuntimeState = {}) {
    if (typeof mimoStateApi?.buildRuntimeStatePatch === 'function') {
      return mimoStateApi.buildRuntimeStatePatch(currentState, nextRuntimeState);
    }
    const baseRuntimeState = isPlainObject(currentState?.runtimeState)
      ? cloneValue(currentState.runtimeState)
      : {};
    const baseFlowState = isPlainObject(baseRuntimeState.flowState)
      ? cloneValue(baseRuntimeState.flowState)
      : {};
    return {
      runtimeState: {
        ...baseRuntimeState,
        flowState: {
          ...baseFlowState,
          mimo: deepMerge(readMimoRuntime(currentState), nextRuntimeState),
        },
      },
    };
  }

  function mergeRuntimePatch(currentState = {}, patch = {}) {
    return buildCanonicalRuntimePatch(
      currentState,
      deepMerge(readMimoRuntime(currentState), patch)
    );
  }

  function resolveMimoMimo2ApiConfig(state = {}) {
    const nestedConfig = state?.settingsState?.flows?.mimo?.targets?.mimo2api || {};
    return {
      baseUrl: cleanString(nestedConfig.baseUrl || state?.mimoMimo2ApiUrl),
      adminPassword: cleanString(nestedConfig.adminPassword ?? state?.mimoMimo2ApiAdminPassword ?? ''),
    };
  }

  function parseMimoCookieValues(state = {}) {
    const runtime = readMimoRuntime(state);
    let entries = Array.isArray(runtime?.cookie?.cookies) && runtime.cookie.cookies.length
      ? runtime.cookie.cookies
      : (Array.isArray(state?.mimoCookies) ? state.mimoCookies : []);
    if (!entries.length) {
      const combined = cleanString(runtime?.cookie?.currentCookie || state?.mimoCookie);
      entries = combined ? combined.split(/;\s*/) : [];
    }
    const map = {};
    for (const entry of entries) {
      const text = String(entry || '');
      const idx = text.indexOf('=');
      if (idx > 0) {
        const name = text.slice(0, idx).trim();
        const value = text.slice(idx + 1).trim();
        if (name) {
          map[name] = value;
        }
      }
    }
    return {
      serviceToken: stripCookieQuotes(map.serviceToken),
      userId: stripCookieQuotes(map.userId),
      xiaomichatbot_ph: stripCookieQuotes(map.xiaomichatbot_ph),
    };
  }

  function resolveMimoAccountName(state = {}) {
    const runtime = readMimoRuntime(state);
    return cleanString(runtime?.register?.email || state?.mimoEmail || state?.email);
  }

  function resolveMimoAccountPassword(state = {}) {
    const runtime = readMimoRuntime(state);
    return cleanString(runtime?.register?.password || state?.mimoPassword || state?.customPassword || state?.password);
  }

  function buildMimoAccountPayload(cookieValues = {}, name = '', password = '') {
    const payload = {
      serviceToken: cleanString(cookieValues.serviceToken),
      userId: cleanString(cookieValues.userId),
      xiaomichatbot_ph: cleanString(cookieValues.xiaomichatbot_ph),
    };
    const normalizedName = cleanString(name);
    if (normalizedName) {
      payload.name = normalizedName;
    }
    const normalizedPassword = cleanString(password);
    if (normalizedPassword) {
      payload.password = normalizedPassword;
    }
    return payload;
  }

  async function uploadMimoAccountToMimo2Api(baseUrl, adminPassword, payload, fetchImpl) {
    const origin = normalizeMimo2ApiBaseUrl(baseUrl);
    const normalizedPassword = cleanString(adminPassword);
    if (!normalizedPassword) {
      throw new Error('缺少 mimo2api 管理密码。');
    }

    // mimo2api 已改为 Bearer 鉴权：直接带 Authorization: Bearer <管理密码> 调用账号接口，
    // 不再先 POST /admin/login 换取 admin_session Cookie，因此请求也不携带任何 Cookie。
    const uploadResponse = await fetchImpl(`${origin}${MIMO2API_ACCOUNTS_PATH}`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${normalizedPassword}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await readResponse(uploadResponse);
    if (!uploadResponse.ok) {
      const message = readMimo2ApiResponseMessage(body, uploadResponse.statusText) || `HTTP ${uploadResponse.status}`;
      throw new Error(`mimo2api 账号上传失败：${message}`);
    }
    if (isPlainObject(body.json) && Object.prototype.hasOwnProperty.call(body.json, 'code') && Number(body.json.code) !== 0) {
      const message = readMimo2ApiResponseMessage(body, `code=${body.json.code}`);
      throw new Error(`mimo2api 账号上传失败：${message}`);
    }
    return {
      endpointUrl: `${origin}${MIMO2API_ACCOUNTS_PATH}`,
      message: readMimo2ApiResponseMessage(body, '') || '上传成功',
      raw: body.json,
    };
  }

  function createMimoMimo2ApiPublisher(deps = {}) {
    const {
      addLog = async () => {},
      completeNodeFromBackground,
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      getState = async () => ({}),
      setState = async () => {},
    } = deps;

    if (typeof completeNodeFromBackground !== 'function') {
      throw new Error('Mimo mimo2api publisher requires completeNodeFromBackground.');
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('Mimo mimo2api publisher requires fetch support.');
    }

    async function log(message, level = 'info', nodeId = '') {
      await addLog(message, level, nodeId ? { nodeId } : {});
    }

    async function applyRuntimeState(currentState = {}, patch = {}) {
      const nextPatch = mergeRuntimePatch(currentState, patch);
      await setState(nextPatch);
      return nextPatch;
    }

    async function persistFailure(currentState = {}, message = '', targetUrl = '') {
      const uploadPatch = {
        status: 'error',
        uploadedAt: 0,
        message,
      };
      const normalizedTargetUrl = cleanString(targetUrl);
      if (normalizedTargetUrl) {
        uploadPatch.targetUrl = normalizedTargetUrl;
      }
      const nextPatch = mergeRuntimePatch(currentState, {
        session: { lastError: message },
        upload: uploadPatch,
      });
      await setState(nextPatch);
    }

    async function executeMimoUploadAccountToMimo2Api(state = {}) {
      const nodeId = cleanString(state?.nodeId) || 'mimo-upload-account-to-mimo2api';
      const currentState = await getState();
      let failureTargetUrl = '';
      try {
        const targetConfig = resolveMimoMimo2ApiConfig(currentState);
        if (!targetConfig.baseUrl) {
          throw new Error('缺少 mimo2api 地址。');
        }
        failureTargetUrl = `${normalizeMimo2ApiBaseUrl(targetConfig.baseUrl)}${MIMO2API_ACCOUNTS_PATH}`;
        if (!targetConfig.adminPassword) {
          throw new Error('缺少 mimo2api 管理密码。');
        }
        const cookieValues = parseMimoCookieValues(currentState);
        if (!cookieValues.serviceToken) {
          throw new Error('缺少小米登录 Cookie（serviceToken），请先完成步骤 6。');
        }
        const payload = buildMimoAccountPayload(
          cookieValues,
          resolveMimoAccountName(currentState),
          resolveMimoAccountPassword(currentState)
        );

        await applyRuntimeState(currentState, {
          session: { lastError: '' },
          upload: {
            status: 'uploading',
            uploadedAt: 0,
            message: '',
            targetUrl: failureTargetUrl,
          },
        });

        await log('步骤 7：正在上传账号到 mimo2api...', 'info', nodeId);
        const uploadResult = await uploadMimoAccountToMimo2Api(
          targetConfig.baseUrl,
          targetConfig.adminPassword,
          payload,
          fetchImpl
        );
        const uploadedAt = Date.now();
        const resultPayload = await applyRuntimeState(currentState, {
          session: { lastError: '' },
          upload: {
            status: 'uploaded',
            uploadedAt,
            message: uploadResult.message || '上传成功',
            targetUrl: uploadResult.endpointUrl,
          },
        });
        await log(`步骤 7：账号已上传到 mimo2api，状态：${uploadResult.message || '上传成功'}。`, 'ok', nodeId);
        await completeNodeFromBackground(nodeId, resultPayload);
      } catch (error) {
        const message = getErrorMessage(error);
        await persistFailure(currentState, message, failureTargetUrl);
        await log(`步骤 7：${message}`, 'error', nodeId);
        throw error;
      }
    }

    return {
      executeMimoUploadAccountToMimo2Api,
    };
  }

  return {
    buildMimoAccountPayload,
    createMimoMimo2ApiPublisher,
    normalizeMimo2ApiBaseUrl,
    parseMimoCookieValues,
    uploadMimoAccountToMimo2Api,
  };
});
