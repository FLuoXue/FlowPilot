(function attachMimoMailRules(root, factory) {
  root.MultiPageMimoMailRules = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function createMimoMailRulesModule(root) {
  const mimoStateApi = root.MultiPageBackgroundMimoState || null;
  const SUBMIT_VERIFICATION_CODE_RULE_ID = 'mimo-submit-verification-code';
  const SUBMIT_VERIFICATION_CODE_NODE_ID = 'mimo-submit-verification-code';
  const VERIFY_EMAIL_NODE_ID = 'mimo-verify-email';
  // TODO(待用户提供): 用真实的小米验证码邮件特征校准下面的发件人/主题/验证码格式。
  // 当前为小米账号验证邮件的合理默认（6 位数字码），先让链路可运行。
  const MIMO_VERIFICATION_CODE_PATTERNS = Object.freeze([
    Object.freeze({
      source: '(?:verification\\s*code|confirmation\\s*code|code\\s*is)[：:\\s]*(\\d{6})',
      flags: 'gi',
    }),
    Object.freeze({
      source: '(?:验证码|校验码|确认码)[：:\\s为是]*(\\d{6})',
      flags: 'gi',
    }),
    Object.freeze({
      source: '(?<!\\d)(\\d{6})(?!\\d)',
      flags: 'g',
    }),
  ]);
  const MIMO_SENDER_FILTERS = Object.freeze([
    'noreply@notice.xiaomi.com',
  ]);
  const MIMO_SUBJECT_FILTERS = Object.freeze([
    'xiaomi',
    '小米',
    'mi account',
    'verification',
    'confirmation',
    'code',
    '验证码',
    '验证',
    '确认码',
  ]);
  const MIMO_REQUIRED_KEYWORDS = Object.freeze([
    'xiaomi',
    'mi.com',
    '小米',
    'verification',
    'confirmation',
    'code',
    '验证码',
    '验证',
    '确认码',
  ]);

  function cleanString(value = '') {
    return String(value ?? '').trim();
  }

  function readMimoRuntime(state = {}) {
    if (typeof mimoStateApi?.ensureRuntimeState === 'function') {
      return mimoStateApi.ensureRuntimeState(state);
    }
    return state?.runtimeState?.flowState?.mimo || state?.flowState?.mimo || {};
  }

  function buildTargetEmailHints(targetEmail = '') {
    const normalizedTarget = cleanString(targetEmail).toLowerCase();
    return normalizedTarget ? [normalizedTarget] : [];
  }

  function getVisibleStep(state = {}) {
    const explicitStep = Number(state?.visibleStep || state?.step);
    return Number.isInteger(explicitStep) && explicitStep > 0 ? explicitStep : 3;
  }

  function isMail2925Provider(state = {}) {
    return cleanString(state?.mailProvider).toLowerCase() === '2925';
  }

  function shouldMatchMail2925TargetEmail(state = {}) {
    return isMail2925Provider(state)
      && cleanString(state?.mail2925Mode).toLowerCase() === 'receive';
  }

  function createMimoMailRules(deps = {}) {
    const {
      LUCKMAIL_PROVIDER = 'luckmail-api',
      MAIL_2925_VERIFICATION_INTERVAL_MS = 15000,
      MAIL_2925_VERIFICATION_MAX_ATTEMPTS = 15,
    } = deps;

    function getRuleDefinition(_input, state = {}) {
      const runtimeState = readMimoRuntime(state);
      const targetEmail = cleanString(runtimeState.register?.email || state?.mimoEmail || state?.email).toLowerCase();
      const normalizedProvider = cleanString(state?.mailProvider).toLowerCase();
      const mail2925Provider = isMail2925Provider(state);
      const luckmailProvider = normalizedProvider === cleanString(LUCKMAIL_PROVIDER).toLowerCase();

      return {
        flowId: 'mimo',
        ruleId: SUBMIT_VERIFICATION_CODE_RULE_ID,
        nodeId: SUBMIT_VERIFICATION_CODE_NODE_ID,
        step: getVisibleStep(state),
        artifactType: 'code',
        codePatterns: MIMO_VERIFICATION_CODE_PATTERNS,
        filterAfterTimestamp: 0,
        // 小米验证码邮件只在“本次注册”提交后才会发出，且常用的是可复用邮箱（里面可能残留历史旧验证码邮件）。
        // strictTimeWindow 要求收码层只接受 filterAfterTimestamp 之后到达的邮件、并取其中最新一封，
        // 禁用“窗口内找不到就忽略时间窗回退取任意旧邮件”的逻辑，避免误取邮箱里更旧的历史验证码。
        strictTimeWindow: true,
        requiredKeywords: MIMO_REQUIRED_KEYWORDS,
        senderFilters: MIMO_SENDER_FILTERS,
        subjectFilters: MIMO_SUBJECT_FILTERS,
        targetEmail,
        targetEmailHints: buildTargetEmailHints(targetEmail),
        mail2925MatchTargetEmail: shouldMatchMail2925TargetEmail(state),
        maxAttempts: luckmailProvider
          ? 3
          : (mail2925Provider ? MAIL_2925_VERIFICATION_MAX_ATTEMPTS : 5),
        intervalMs: luckmailProvider
          ? 15000
          : (mail2925Provider ? MAIL_2925_VERIFICATION_INTERVAL_MS : 5000),
      };
    }

    function getRuleDefinitionForNode(nodeId, state = {}) {
      const normalizedNodeId = cleanString(nodeId);
      if (normalizedNodeId && normalizedNodeId !== SUBMIT_VERIFICATION_CODE_NODE_ID && normalizedNodeId !== VERIFY_EMAIL_NODE_ID) {
        throw new Error(`小米邮件规则不支持节点：${normalizedNodeId}`);
      }
      return getRuleDefinition({ nodeId: normalizedNodeId || SUBMIT_VERIFICATION_CODE_NODE_ID }, state);
    }

    function buildVerificationPollPayload(input, state = {}, overrides = {}) {
      return {
        ...getRuleDefinition(input, state),
        ...(overrides || {}),
      };
    }

    function buildVerificationPollPayloadForNode(nodeId, state = {}, overrides = {}) {
      return {
        ...getRuleDefinitionForNode(nodeId, state),
        ...(overrides || {}),
      };
    }

    return {
      buildVerificationPollPayload,
      buildVerificationPollPayloadForNode,
      getRuleDefinition,
      getRuleDefinitionForNode,
    };
  }

  return {
    MIMO_REQUIRED_KEYWORDS,
    MIMO_SENDER_FILTERS,
    MIMO_SUBJECT_FILTERS,
    MIMO_VERIFICATION_CODE_PATTERNS,
    SUBMIT_VERIFICATION_CODE_NODE_ID,
    SUBMIT_VERIFICATION_CODE_RULE_ID,
    createMimoMailRules,
  };
});
