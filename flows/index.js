(function attachMultiPageFlowsIndex(root, factory) {
  root.MultiPageFlowsIndex = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createFlowsIndexModule() {
  const rootScope = typeof self !== 'undefined' ? self : globalThis;

  const FLOW_ENTRY_DEFINITIONS = Object.freeze({
    openai: {
      id: 'openai',
      path: 'flows/openai/',
    },
    kiro: {
      id: 'kiro',
      path: 'flows/kiro/',
    },
    grok: {
      id: 'grok',
      path: 'flows/grok/',
    },
    mimo: {
      id: 'mimo',
      path: 'flows/mimo/',
    },
  });

  const FLOW_DEFINITION_GLOBALS = Object.freeze({
    openai: 'MultiPageOpenAiFlowDefinition',
    kiro: 'MultiPageKiroFlowDefinition',
    grok: 'MultiPageGrokFlowDefinition',
    mimo: 'MultiPageMimoFlowDefinition',
  });

  const FLOW_WORKFLOW_GLOBALS = Object.freeze({
    openai: 'MultiPageOpenAiWorkflow',
    kiro: 'MultiPageKiroWorkflow',
    grok: 'MultiPageGrokWorkflow',
    mimo: 'MultiPageMimoWorkflow',
  });

  function normalizeFlowId(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function getRegisteredFlowIds() {
    return Object.keys(FLOW_ENTRY_DEFINITIONS);
  }

  function getFlowEntry(flowId) {
    const normalized = normalizeFlowId(flowId);
    const baseEntry = FLOW_ENTRY_DEFINITIONS[normalized];
    if (!baseEntry) {
      return null;
    }
    return {
      ...baseEntry,
      definition: rootScope[FLOW_DEFINITION_GLOBALS[normalized]] || null,
      workflow: rootScope[FLOW_WORKFLOW_GLOBALS[normalized]] || null,
    };
  }

  function getFlowDefinition(flowId) {
    return getFlowEntry(flowId)?.definition || null;
  }

  function getFlowDefinitions() {
    const next = {};
    getRegisteredFlowIds().forEach((flowId) => {
      const definition = getFlowDefinition(flowId);
      if (definition) {
        next[flowId] = definition;
      }
    });
    return next;
  }

  function getFlowWorkflow(flowId) {
    return getFlowEntry(flowId)?.workflow || null;
  }

  return {
    getFlowEntry,
    getFlowDefinition,
    getFlowDefinitions,
    getFlowWorkflow,
    getRegisteredFlowIds,
  };
});
