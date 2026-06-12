const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadMimoMailRules() {
  const mimoSource = fs.readFileSync('flows/mimo/mail-rules.js', 'utf8');
  const scope = {};
  new Function('self', `${mimoSource}; return self;`)(scope);
  return scope.MultiPageMimoMailRules.createMimoMailRules({
    LUCKMAIL_PROVIDER: 'luckmail-api',
    MAIL_2925_VERIFICATION_INTERVAL_MS: 15000,
    MAIL_2925_VERIFICATION_MAX_ATTEMPTS: 15,
  });
}

test('mimo verification rules enable strictTimeWindow for both code nodes', () => {
  const mimoMailRules = loadMimoMailRules();

  for (const nodeId of ['mimo-submit-verification-code', 'mimo-verify-email']) {
    const payload = mimoMailRules.buildVerificationPollPayloadForNode(
      nodeId,
      { activeFlowId: 'mimo', mimoEmail: 'mimo-user@example.com' },
      { filterAfterTimestamp: 1700000000000 }
    );

    // strictTimeWindow 是本次修复的关键：要求 Hotmail 收码层只接受时间窗内邮件、不回退取旧邮件。
    assert.equal(payload.strictTimeWindow, true, `${nodeId} 应开启 strictTimeWindow`);
    // 运行时传入的 filterAfterTimestamp 必须覆盖规则里默认的 0。
    assert.equal(payload.filterAfterTimestamp, 1700000000000, `${nodeId} 应透传 filterAfterTimestamp`);
    assert.equal(payload.flowId, 'mimo');
    assert.equal(payload.targetEmail, 'mimo-user@example.com');
  }
});

test('mimo rules reject unknown verification nodes', () => {
  const mimoMailRules = loadMimoMailRules();
  assert.throws(
    () => mimoMailRules.getRuleDefinitionForNode('mimo-open-signup-page', { activeFlowId: 'mimo' }),
    /小米邮件规则不支持节点/
  );
});

test('Hotmail API polling consults strictTimeWindow and uses the strict (no time fallback) matcher', () => {
  // pollHotmailVerificationCode 不是可独立 require 的模块，这里用源码级断言锁定接线，
  // 避免后续重构把 strictTimeWindow 分支去掉、又退回到会误取旧邮件的时间回退逻辑。
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /pollPayload\.strictTimeWindow/);
  assert.match(source, /pickVerificationMessageWithFallback\(fetchResult\.messages/);
});
