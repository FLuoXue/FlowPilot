(function attachBackgroundMimoState(root, factory) {
  root.MultiPageBackgroundMimoState = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundMimoStateModule() {
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
    const next = {
      ...cloneValue(baseObject),
    };
    Object.entries(patchValue).forEach(([key, value]) => {
      next[key] = deepMerge(baseObject[key], value);
    });
    return next;
  }

  function cleanString(value = '') {
    return String(value ?? '').trim();
  }

  function assignCleanString(target = {}, key = '', value = '') {
    const normalized = cleanString(value);
    if (normalized) {
      target[key] = normalized;
    }
  }

  function assignPositiveInteger(target = {}, key = '', value) {
    const numeric = Math.floor(Number(value));
    if (Number.isInteger(numeric) && numeric > 0) {
      target[key] = numeric;
    }
  }

  function assignNonEmptyArray(target = {}, key = '', value) {
    if (Array.isArray(value) && value.length) {
      target[key] = value;
    }
  }

  function normalizeInteger(value, fallback = 0) {
    const numeric = Math.floor(Number(value));
    return Number.isInteger(numeric) ? numeric : fallback;
  }

  function normalizeNullableInteger(value, fallback = null) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    const numeric = Math.floor(Number(value));
    return Number.isInteger(numeric) ? numeric : fallback;
  }

  function normalizeCookies(values = []) {
    if (!Array.isArray(values)) {
      return [];
    }
    return Array.from(new Set(
      values
        .map((entry) => cleanString(entry))
        .filter(Boolean)
    ));
  }

  function buildDefaultRuntimeState() {
    return {
      session: {
        registerTabId: null,
        startedAt: 0,
        pageState: '',
        pageUrl: '',
        lastError: '',
      },
      register: {
        email: '',
        password: '',
        verificationRequestedAt: 0,
        verificationCode: '',
        status: '',
        completedAt: 0,
      },
      cookie: {
        currentCookie: '',
        cookies: [],
        extractedAt: 0,
      },
      upload: {
        status: '',
        uploadedAt: 0,
        message: '',
        targetUrl: '',
      },
    };
  }

  function normalizeRuntimeState(runtimeState = {}) {
    const merged = deepMerge(buildDefaultRuntimeState(), runtimeState);
    return {
      session: {
        registerTabId: normalizeNullableInteger(merged.session?.registerTabId),
        startedAt: Math.max(0, normalizeInteger(merged.session?.startedAt)),
        pageState: cleanString(merged.session?.pageState),
        pageUrl: cleanString(merged.session?.pageUrl),
        lastError: cleanString(merged.session?.lastError),
      },
      register: {
        email: cleanString(merged.register?.email).toLowerCase(),
        password: cleanString(merged.register?.password),
        verificationRequestedAt: Math.max(0, normalizeInteger(merged.register?.verificationRequestedAt)),
        verificationCode: cleanString(merged.register?.verificationCode),
        status: cleanString(merged.register?.status),
        completedAt: Math.max(0, normalizeInteger(merged.register?.completedAt)),
      },
      cookie: {
        currentCookie: cleanString(merged.cookie?.currentCookie || merged.cookieValue),
        cookies: normalizeCookies(merged.cookie?.cookies || merged.cookies),
        extractedAt: Math.max(0, normalizeInteger(merged.cookie?.extractedAt)),
      },
      upload: {
        status: cleanString(merged.upload?.status),
        uploadedAt: Math.max(0, normalizeInteger(merged.upload?.uploadedAt)),
        message: cleanString(merged.upload?.message),
        targetUrl: cleanString(merged.upload?.targetUrl),
      },
    };
  }

  function buildCanonicalRuntimeStatePatch(state = {}, runtimeState = {}) {
    const normalizedRuntimeState = normalizeRuntimeState(runtimeState);
    const baseRuntimeState = isPlainObject(state?.runtimeState)
      ? cloneValue(state.runtimeState)
      : {};
    const baseFlowState = isPlainObject(baseRuntimeState.flowState)
      ? cloneValue(baseRuntimeState.flowState)
      : {};
    return {
      ...baseRuntimeState,
      flowState: {
        ...baseFlowState,
        mimo: normalizedRuntimeState,
      },
    };
  }

  function projectRuntimeFields(runtimeState = {}) {
    const normalizedRuntimeState = normalizeRuntimeState(runtimeState);
    return {
      mimoRegisterTabId: normalizedRuntimeState.session.registerTabId,
      mimoPageState: normalizedRuntimeState.session.pageState,
      mimoPageUrl: normalizedRuntimeState.session.pageUrl,
      mimoEmail: normalizedRuntimeState.register.email,
      mimoPassword: normalizedRuntimeState.register.password,
      mimoVerificationRequestedAt: normalizedRuntimeState.register.verificationRequestedAt,
      mimoVerificationCode: normalizedRuntimeState.register.verificationCode,
      mimoRegisterStatus: normalizedRuntimeState.register.status,
      mimoCompletedAt: normalizedRuntimeState.register.completedAt,
      mimoCookie: normalizedRuntimeState.cookie.currentCookie,
      mimoCookies: normalizedRuntimeState.cookie.cookies,
      mimoCookieExtractedAt: normalizedRuntimeState.cookie.extractedAt,
      mimoUploadStatus: normalizedRuntimeState.upload.status,
      mimoUploadedAt: normalizedRuntimeState.upload.uploadedAt,
      mimoUploadMessage: normalizedRuntimeState.upload.message,
      mimoUploadTargetUrl: normalizedRuntimeState.upload.targetUrl,
    };
  }

  function ensureRuntimeState(state = {}) {
    const runtimeFlowState = isPlainObject(state?.runtimeState?.flowState)
      ? state.runtimeState.flowState
      : {};
    const legacyFlowState = isPlainObject(state?.flowState?.mimo)
      ? state.flowState.mimo
      : {};
    const flatRuntime = {
      session: {},
      register: {},
      cookie: {},
      upload: {},
    };
    assignPositiveInteger(flatRuntime.session, 'registerTabId', state.mimoRegisterTabId);
    assignCleanString(flatRuntime.session, 'pageState', state.mimoPageState);
    assignCleanString(flatRuntime.session, 'pageUrl', state.mimoPageUrl || state.mimoSignupUrl);
    assignCleanString(flatRuntime.register, 'email', state.mimoEmail || state.email);
    assignCleanString(flatRuntime.register, 'password', state.mimoPassword);
    assignPositiveInteger(flatRuntime.register, 'verificationRequestedAt', state.mimoVerificationRequestedAt);
    assignCleanString(flatRuntime.register, 'verificationCode', state.mimoVerificationCode);
    assignCleanString(flatRuntime.register, 'status', state.mimoRegisterStatus);
    assignPositiveInteger(flatRuntime.register, 'completedAt', state.mimoCompletedAt);
    assignCleanString(flatRuntime.cookie, 'currentCookie', state.mimoCookie);
    assignNonEmptyArray(flatRuntime.cookie, 'cookies', state.mimoCookies);
    assignPositiveInteger(flatRuntime.cookie, 'extractedAt', state.mimoCookieExtractedAt || state.mimoCompletedAt);
    assignCleanString(flatRuntime.upload, 'status', state.mimoUploadStatus);
    assignPositiveInteger(flatRuntime.upload, 'uploadedAt', state.mimoUploadedAt);
    assignCleanString(flatRuntime.upload, 'message', state.mimoUploadMessage);
    assignCleanString(flatRuntime.upload, 'targetUrl', state.mimoUploadTargetUrl);
    return normalizeRuntimeState(deepMerge(deepMerge(runtimeFlowState.mimo || {}, legacyFlowState), flatRuntime));
  }

  function buildStateView(state = {}) {
    const runtimeState = ensureRuntimeState(state);
    const canonicalRuntimeState = buildCanonicalRuntimeStatePatch(state, runtimeState);
    return {
      ...state,
      ...projectRuntimeFields(runtimeState),
      runtimeState: canonicalRuntimeState,
      flowState: {
        ...(isPlainObject(state?.flowState) ? state.flowState : {}),
        mimo: runtimeState,
      },
      flows: {
        ...(isPlainObject(state?.flows) ? state.flows : {}),
        mimo: runtimeState,
      },
    };
  }

  function buildRuntimeStatePatch(currentState = {}, patch = {}) {
    if (!isPlainObject(patch)) {
      return {};
    }
    const nextRuntimeState = normalizeRuntimeState(
      deepMerge(ensureRuntimeState(currentState), patch)
    );
    return {
      ...projectRuntimeFields(nextRuntimeState),
      runtimeState: buildCanonicalRuntimeStatePatch(currentState, nextRuntimeState),
    };
  }

  function buildSessionStatePatch(currentState = {}, updates = {}) {
    const runtimePatch = isPlainObject(updates?.runtimeState?.flowState?.mimo)
      ? updates.runtimeState.flowState.mimo
      : (isPlainObject(updates?.flowState?.mimo) ? updates.flowState.mimo : null);
    if (!runtimePatch) {
      return {};
    }
    return buildRuntimeStatePatch(currentState, runtimePatch);
  }

  function buildStartRegisterResetPatch(currentState = {}) {
    return buildRuntimeStatePatch(currentState, buildDefaultRuntimeState());
  }

  function buildFormResetPatch(currentState = {}) {
    const currentRuntimeState = ensureRuntimeState(currentState);
    const defaults = buildDefaultRuntimeState();
    return buildRuntimeStatePatch(currentState, {
      ...currentRuntimeState,
      session: {
        ...currentRuntimeState.session,
        pageState: '',
        pageUrl: '',
        lastError: '',
      },
      register: defaults.register,
      cookie: defaults.cookie,
      upload: defaults.upload,
    });
  }

  function buildVerificationResetPatch(currentState = {}) {
    const currentRuntimeState = ensureRuntimeState(currentState);
    const defaults = buildDefaultRuntimeState();
    return buildRuntimeStatePatch(currentState, {
      ...currentRuntimeState,
      session: {
        ...currentRuntimeState.session,
        lastError: '',
      },
      register: {
        ...currentRuntimeState.register,
        verificationCode: '',
        status: '',
        completedAt: 0,
      },
      cookie: defaults.cookie,
      upload: defaults.upload,
    });
  }

  function buildCookieResetPatch(currentState = {}) {
    const currentRuntimeState = ensureRuntimeState(currentState);
    const defaults = buildDefaultRuntimeState();
    return buildRuntimeStatePatch(currentState, {
      ...currentRuntimeState,
      cookie: defaults.cookie,
      upload: defaults.upload,
    });
  }

  function buildUploadResetPatch(currentState = {}) {
    const currentRuntimeState = ensureRuntimeState(currentState);
    return buildRuntimeStatePatch(currentState, {
      ...currentRuntimeState,
      upload: buildDefaultRuntimeState().upload,
    });
  }

  function buildDownstreamResetPatch(stepKey = '', currentState = {}) {
    switch (cleanString(stepKey)) {
      case 'mimo-open-signup-page':
        return {
          flowStartTime: null,
          ...buildStartRegisterResetPatch(currentState),
        };
      case 'mimo-submit-register-form':
        return buildFormResetPatch(currentState);
      case 'mimo-submit-verification-code':
        return buildVerificationResetPatch(currentState);
      case 'mimo-verify-email':
        return buildVerificationResetPatch(currentState);
      case 'mimo-goto-ai-studio':
        return buildCookieResetPatch(currentState);
      case 'mimo-extract-cookie':
        return buildCookieResetPatch(currentState);
      case 'mimo-upload-account-to-mimo2api':
        return buildUploadResetPatch(currentState);
      default:
        return {};
    }
  }

  function applyNodeCompletionPayload(currentState = {}, payload = {}) {
    const runtimePatch = isPlainObject(payload?.runtimeState?.flowState?.mimo)
      ? payload.runtimeState.flowState.mimo
      : (isPlainObject(payload?.flowState?.mimo) ? payload.flowState.mimo : null);
    if (runtimePatch) {
      return buildRuntimeStatePatch(currentState, runtimePatch);
    }

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoRegisterTabId')) {
      patch.session = { ...(patch.session || {}), registerTabId: payload.mimoRegisterTabId };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoPageState')) {
      patch.session = { ...(patch.session || {}), pageState: payload.mimoPageState };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoPageUrl') || Object.prototype.hasOwnProperty.call(payload, 'mimoSignupUrl')) {
      patch.session = {
        ...(patch.session || {}),
        pageUrl: payload.mimoPageUrl || payload.mimoSignupUrl || '',
      };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoEmail') || Object.prototype.hasOwnProperty.call(payload, 'email')) {
      patch.register = {
        ...(patch.register || {}),
        email: payload.mimoEmail || payload.email || '',
      };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoPassword')) {
      patch.register = { ...(patch.register || {}), password: payload.mimoPassword };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoVerificationRequestedAt')) {
      patch.register = {
        ...(patch.register || {}),
        verificationRequestedAt: payload.mimoVerificationRequestedAt,
      };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoVerificationCode')) {
      patch.register = { ...(patch.register || {}), verificationCode: payload.mimoVerificationCode };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoRegisterStatus')) {
      patch.register = { ...(patch.register || {}), status: payload.mimoRegisterStatus };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoCompletedAt')) {
      patch.register = { ...(patch.register || {}), completedAt: payload.mimoCompletedAt };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoCookie')) {
      patch.cookie = { ...(patch.cookie || {}), currentCookie: payload.mimoCookie };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoCookies')) {
      patch.cookie = { ...(patch.cookie || {}), cookies: payload.mimoCookies };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoCookieExtractedAt') || Object.prototype.hasOwnProperty.call(payload, 'mimoCompletedAt')) {
      patch.cookie = {
        ...(patch.cookie || {}),
        extractedAt: payload.mimoCookieExtractedAt || payload.mimoCompletedAt || 0,
      };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoUploadStatus')) {
      patch.upload = { ...(patch.upload || {}), status: payload.mimoUploadStatus };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoUploadedAt')) {
      patch.upload = { ...(patch.upload || {}), uploadedAt: payload.mimoUploadedAt };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoUploadMessage')) {
      patch.upload = { ...(patch.upload || {}), message: payload.mimoUploadMessage };
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'mimoUploadTargetUrl')) {
      patch.upload = { ...(patch.upload || {}), targetUrl: payload.mimoUploadTargetUrl };
    }
    if (!Object.keys(patch).length) {
      return {};
    }
    return buildRuntimeStatePatch(currentState, patch);
  }

  function buildFreshKeepState(currentState = {}) {
    return buildRuntimeStatePatch(currentState, buildDefaultRuntimeState());
  }

  return {
    applyNodeCompletionPayload,
    buildDefaultRuntimeState,
    buildDownstreamResetPatch,
    buildFreshKeepState,
    buildRuntimeStatePatch,
    buildSessionStatePatch,
    buildStateView,
    ensureRuntimeState,
    normalizeCookies,
    projectRuntimeFields,
  };
});
