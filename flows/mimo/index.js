(function attachMultiPageMimoFlowDefinition(root, factory) {
  root.MultiPageMimoFlowDefinition = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createMultiPageMimoFlowDefinition() {
  function freezeDeep(entry) {
    if (!entry || typeof entry !== 'object' || Object.isFrozen(entry)) {
      return entry;
    }
    Object.getOwnPropertyNames(entry).forEach((key) => {
      freezeDeep(entry[key]);
    });
    return Object.freeze(entry);
  }

  const VALUE = freezeDeep({
    id: 'mimo',
    label: 'Xiaomi MiMo',
    services: [
      'account',
      'email',
      'proxy',
    ],
    capabilities: {
      supportsEmailSignup: true,
      supportsPhoneSignup: false,
      supportsPhoneVerificationSettings: false,
      supportsPlusMode: false,
      supportsContributionMode: false,
      supportsAccountContribution: false,
      supportsOpenAiOAuthContribution: false,
      contributionAdapterIds: [],
      supportedTargetIds: ['mimo2api'],
      supportsLuckmail: false,
      canSwitchFlow: true,
      stepDefinitionMode: 'mimo',
      targetSelectorLabel: '来源',
    },
    baseGroups: ['mimo-runtime-status', 'shared-auto-run'],
    targets: {
      mimo2api: {
        id: 'mimo2api',
        label: 'mimo2api',
        groups: [
          'mimo-target-mimo2api',
        ],
        defaultState: {
          baseUrl: '',
          adminPassword: '',
        },
      },
    },
    publicationTargets: {},
    runtimeSources: {
      'mimo-register-page': {
        flowId: 'mimo',
        kind: 'flow-page',
        label: '小米注册页',
        readyPolicy: 'top-frame-only',
        family: 'mimo-register-page-family',
        driverId: 'flows/mimo/content/register-page',
        cleanupScopes: [],
        detectionMatchers: [
          {
            hostnames: [
              'global.account.xiaomi.com',
              'account.xiaomi.com',
              'xiaomi.com',
              'aistudio.xiaomimimo.com',
              'xiaomimimo.com',
            ],
            hostnameEndsWith: [
              '.xiaomi.com',
              '.xiaomimimo.com',
            ],
            matchMode: 'any',
          },
        ],
        familyMatchers: [
          {
            hostnames: [
              'global.account.xiaomi.com',
              'account.xiaomi.com',
              'xiaomi.com',
              'aistudio.xiaomimimo.com',
              'xiaomimimo.com',
            ],
            hostnameEndsWith: [
              '.xiaomi.com',
              '.xiaomimimo.com',
            ],
            matchMode: 'any',
          },
        ],
      },
    },
    driverDefinitions: {
      'flows/mimo/content/register-page': {
        sourceId: 'mimo-register-page',
        commands: [
          'mimo-open-signup-page',
          'mimo-submit-register-form',
          'mimo-submit-verification-code',
          'mimo-verify-email-send',
          'mimo-extract-cookie',
        ],
      },
      'flows/mimo/background/register-runner': {
        sourceId: 'mimo-register-page',
        commands: [
          'mimo-open-signup-page',
          'mimo-submit-register-form',
          'mimo-submit-verification-code',
          'mimo-verify-email',
          'mimo-goto-ai-studio',
          'mimo-extract-cookie',
        ],
      },
      'flows/mimo/background/publisher-mimo2api': {
        sourceId: 'mimo-mimo2api',
        commands: [
          'mimo-upload-account-to-mimo2api',
        ],
      },
    },
    defaultTargetId: 'mimo2api',
    settingsDefaults: {
      targets: {
        mimo2api: {
          baseUrl: '',
          adminPassword: '',
        },
      },
      autoRun: {
        stepExecutionRange: {
          enabled: false,
          fromStep: 1,
          toStep: 7,
        },
      },
    },
    settingsGroups: {
      'mimo-target-mimo2api': {
        id: 'mimo-target-mimo2api',
        label: 'mimo2api',
        rowIds: [
          'row-mimo-mimo2api-url',
          'row-mimo-mimo2api-password',
        ],
      },
      'mimo-runtime-status': {
        id: 'mimo-runtime-status',
        label: 'MiMo 运行态',
        rowIds: [
          'row-mimo-register-status',
          'row-mimo-cookie-status',
          'row-mimo-upload-status',
        ],
      },
    },
    sourceAliases: {},
  });

  return VALUE;
});
