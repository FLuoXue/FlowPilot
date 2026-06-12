(function attachMultiPageMimoWorkflow(root, factory) {
  root.MultiPageMimoWorkflow = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createMultiPageMimoWorkflow() {
  function freezeDeep(entry) {
    if (!entry || typeof entry !== 'object' || Object.isFrozen(entry)) {
      return entry;
    }
    Object.getOwnPropertyNames(entry).forEach((key) => {
      freezeDeep(entry[key]);
    });
    return Object.freeze(entry);
  }

  const STEP_VARIANTS = freezeDeep({
    default: [
      {
        id: 1,
        order: 10,
        key: 'mimo-open-signup-page',
        title: '打开小米注册页',
        sourceId: 'mimo-register-page',
        driverId: 'flows/mimo/background/register-runner',
        command: 'mimo-open-signup-page',
        flowId: 'mimo',
      },
      {
        id: 2,
        order: 20,
        key: 'mimo-submit-register-form',
        title: '填写账号密码并勾选协议',
        sourceId: 'mimo-register-page',
        driverId: 'flows/mimo/background/register-runner',
        command: 'mimo-submit-register-form',
        flowId: 'mimo',
      },
      {
        id: 3,
        order: 30,
        key: 'mimo-submit-verification-code',
        title: '获取验证码并继续',
        sourceId: 'mimo-register-page',
        driverId: 'flows/mimo/background/register-runner',
        command: 'mimo-submit-verification-code',
        mailRuleId: 'mimo-submit-verification-code',
        flowId: 'mimo',
      },
      {
        id: 4,
        order: 40,
        key: 'mimo-verify-email',
        title: '二次邮箱验证',
        sourceId: 'mimo-register-page',
        driverId: 'flows/mimo/background/register-runner',
        command: 'mimo-verify-email',
        mailRuleId: 'mimo-verify-email',
        flowId: 'mimo',
      },
      {
        id: 5,
        order: 50,
        key: 'mimo-goto-ai-studio',
        title: '跳转 AI Studio',
        sourceId: 'mimo-register-page',
        driverId: 'flows/mimo/background/register-runner',
        command: 'mimo-goto-ai-studio',
        flowId: 'mimo',
      },
      {
        id: 6,
        order: 60,
        key: 'mimo-extract-cookie',
        title: '提取登录 Cookie',
        sourceId: 'mimo-register-page',
        driverId: 'flows/mimo/background/register-runner',
        command: 'mimo-extract-cookie',
        flowId: 'mimo',
      },
      {
        id: 7,
        order: 70,
        key: 'mimo-upload-account-to-mimo2api',
        title: '上传账号到 mimo2api',
        sourceId: 'mimo-mimo2api',
        driverId: 'flows/mimo/background/publisher-mimo2api',
        command: 'mimo-upload-account-to-mimo2api',
        flowId: 'mimo',
      },
    ],
  });

  function getVariantStepDefinitions(variantKey = 'default') {
    return Array.isArray(STEP_VARIANTS[variantKey]) ? STEP_VARIANTS[variantKey] : STEP_VARIANTS.default;
  }

  function getModeStepDefinitions() {
    return getVariantStepDefinitions('default');
  }

  function getAllSteps() {
    return getVariantStepDefinitions('default');
  }

  function getPlusPaymentStepTitle() {
    return '';
  }

  function resolveStepTitle(step = {}) {
    return step?.title || '';
  }

  return {
    flowId: 'mimo',
    getAllSteps,
    getModeStepDefinitions,
    getPlusPaymentStepTitle,
    getVariantStepDefinitions,
    resolveStepTitle,
  };
});
