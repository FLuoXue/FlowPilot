const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('sidepanel html no longer renders the contribution mode button, ad bar, or update hint', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.equal((html.match(/id="btn-contribution-mode"/g) || []).length, 0);
  assert.doesNotMatch(html, />贡献\/使用教程<\/button>/);
  assert.doesNotMatch(html, /id="auto-run-ad-bar"/);
  assert.doesNotMatch(html, /id="contribution-update-layer"/);
  assert.doesNotMatch(html, /id="contribution-update-hint"/);
  assert.doesNotMatch(html, /id="contribution-update-hint-text"/);
  assert.doesNotMatch(html, /id="btn-dismiss-contribution-update-hint"/);
});

test('sidepanel source no longer keeps the legacy upload-page handler on the header contribution button', () => {
  const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

  assert.doesNotMatch(source, /openContributionUploadPage/);
  assert.doesNotMatch(source, /await openContributionUploadPage\(\)/);
});
