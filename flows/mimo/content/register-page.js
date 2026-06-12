console.log('[MultiPage:mimo-register-page] Content script loaded on', location.href);

const MIMO_REGISTER_PAGE_LISTENER_SENTINEL = 'data-multipage-mimo-register-page-listener';
const MIMO_SIGNUP_URL = 'https://global.account.xiaomi.com/fe/service/register?sid=xiaomichatbot&_locale=zh_TW&_uRegion=US';
const MIMO_CONSENT_CONFIRM_TEXT_PATTERN = /同意(?:並|并|.{0,4})?(?:繼續|继续)|agree\s*(?:and|&)?\s*continue/i;
const MIMO_CODE_SUBMIT_TEXT_PATTERN = /注册|註冊|立即注册|立即註冊|确定|確定|下一步|提交|继续|繼續|发送|發送|submit|verify|confirm|next/i;
const MIMO_REGISTER_SUBMIT_TEXT_PATTERN = /立即注册|立即註冊|注册|註冊|确定|確定|下一步|发送|發送/i;
const MIMO_SEND_TEXT_PATTERN = /傳送信件|发送信件|傳送|发送/i;
const MIMO_VERIFICATION_READY_TIMEOUT_MS = 90 * 1000;
const MIMO_REQUIRED_COOKIE_NAMES = ['serviceToken', 'userId', 'xiaomichatbot_ph'];

const MIMO_EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[id*="email" i]',
  'input[placeholder*="邮箱"]',
  'input[placeholder*="郵箱"]',
  'input[placeholder*="Email" i]',
  'input[placeholder*="mail" i]',
  'input[autocomplete="email"]',
];
const MIMO_PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name*="password" i]',
  'input[autocomplete="new-password"]',
  'input[placeholder*="password" i]',
  'input[placeholder*="密码"]',
  'input[placeholder*="密碼"]',
];
const MIMO_CODE_SELECTORS = [
  'input[name*="code" i]',
  'input[name*="verify" i]',
  'input[id*="code" i]',
  'input[placeholder*="验证"]',
  'input[placeholder*="驗證"]',
  'input[autocomplete="one-time-code"]',
  'input[inputmode="numeric"]',
];
const MIMO_HUMAN_VERIFICATION_SELECTORS = [
  'iframe[src*="captcha"]',
  'iframe[src*="verify"]',
  'iframe[src*="geetest"]',
  '.miverify',
];

function isVisibleMimoElement(element) {
  if (!element || !(element instanceof Element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getMimoElementText(element) {
  if (!element) return '';
  return String(
    element.innerText
    || element.textContent
    || element.getAttribute?.('aria-label')
    || element.getAttribute?.('title')
    || ''
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function queryVisibleMimoElement(selector) {
  return Array.from(document.querySelectorAll(selector)).find(isVisibleMimoElement) || null;
}

function findMimoClickableByText(pattern) {
  const selectors = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
  return Array.from(document.querySelectorAll(selectors)).find((element) => {
    if (!isVisibleMimoElement(element)) return false;
    const text = element instanceof HTMLInputElement ? element.value : getMimoElementText(element);
    return pattern.test(text);
  }) || null;
}

function simulateMimoClick(element) {
  throwIfStopped();
  if (!element) {
    throw new Error('无法点击空元素。');
  }
  const rect = element.getBoundingClientRect();
  const clientX = Math.max(0, Math.floor(rect.left + Math.min(rect.width - 1, Math.max(1, rect.width / 2))));
  const clientY = Math.max(0, Math.floor(rect.top + Math.min(rect.height - 1, Math.max(1, rect.height / 2))));
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    screenX: window.screenX + clientX,
    screenY: window.screenY + clientY,
  };
  if (typeof PointerEvent === 'function') {
    const pointerOptions = { ...eventOptions, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    element.dispatchEvent(new PointerEvent('pointerover', pointerOptions));
    element.dispatchEvent(new PointerEvent('pointerdown', pointerOptions));
    element.dispatchEvent(new PointerEvent('pointerup', pointerOptions));
  }
  element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
  element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
  element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
  if (typeof element.click === 'function') {
    element.click();
    return;
  }
  element.dispatchEvent(new MouseEvent('click', eventOptions));
}

async function waitForMimo(predicate, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 30000);
  const intervalMs = Math.max(100, Number(options.intervalMs) || 250);
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() <= deadline) {
    throwIfStopped();
    lastValue = predicate();
    if (lastValue) return lastValue;
    await sleep(intervalMs);
  }
  return lastValue;
}

function findMimoEmailInput() {
  return queryVisibleMimoElement(MIMO_EMAIL_SELECTORS.join(', '));
}

function findMimoPasswordInputs() {
  return Array.from(document.querySelectorAll(MIMO_PASSWORD_SELECTORS.join(', ')))
    .filter(isVisibleMimoElement);
}

function getMimoCheckboxClickTarget(checkbox) {
  // 小米 miui 风格的真实 <input type=checkbox> 常被隐藏，需点击其关联的可见 label / 自定义勾选框
  if (checkbox.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(checkbox.id)}"]`);
      if (label && isVisibleMimoElement(label)) return label;
    } catch (_error) {
      /* CSS.escape 不可用时忽略 */
    }
  }
  const parentLabel = checkbox.closest('label');
  if (parentLabel && isVisibleMimoElement(parentLabel)) return parentLabel;
  const wrap = checkbox.closest('.miui-checkbox, [class*="checkbox" i], [class*="agreement" i], [class*="agree" i]');
  if (wrap && isVisibleMimoElement(wrap)) return wrap;
  let sibling = checkbox.nextElementSibling;
  while (sibling) {
    if (isVisibleMimoElement(sibling)) return sibling;
    sibling = sibling.nextElementSibling;
  }
  return null;
}

function findMimoAgreementCheckboxes() {
  // 不按可见性过滤：协议复选框的真实 input 往往是隐藏的，由可见 label/自定义元素代理点击
  return Array.from(document.querySelectorAll('input[type="checkbox"]'));
}

function checkMimoAgreementCheckboxes() {
  const checkboxes = findMimoAgreementCheckboxes();
  for (const checkbox of checkboxes) {
    if (checkbox.checked) continue;
    // 1. 优先点击关联的可见 label / 自定义勾选框（触发框架真实交互）
    const target = getMimoCheckboxClickTarget(checkbox);
    if (target) {
      try { simulateMimoClick(target); } catch (_error) { /* ignore */ }
    }
    // 2. 仍未选中则直接点 input
    if (!checkbox.checked) {
      try { simulateMimoClick(checkbox); } catch (_error) { /* ignore */ }
    }
    // 3. 兜底：用原生 setter 置位并派发 input/change，触发受控组件更新
    if (!checkbox.checked) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
      if (typeof setter === 'function') {
        setter.call(checkbox, true);
      } else {
        checkbox.checked = true;
      }
      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  return {
    total: checkboxes.length,
    checked: checkboxes.filter((checkbox) => checkbox.checked).length,
  };
}

function findMimoCodeInput() {
  const specific = queryVisibleMimoElement(MIMO_CODE_SELECTORS.join(', '));
  if (specific) return specific;
  // 仅当页面已不是注册表单（无邮箱/密码框）时，才把可见文本框视为验证码输入，避免误判注册页文本框
  if (!findMimoEmailInput() && !findMimoPasswordInputs().length) {
    return queryVisibleMimoElement('input[type="text"]');
  }
  return null;
}

function findMimoHumanVerification() {
  return queryVisibleMimoElement(MIMO_HUMAN_VERIFICATION_SELECTORS.join(', '));
}

function findMimoConsentConfirmButton() {
  return Array.from(document.querySelectorAll('button, [role="button"]')).find((element) => {
    if (!isVisibleMimoElement(element)) return false;
    return MIMO_CONSENT_CONFIRM_TEXT_PATTERN.test(getMimoElementText(element));
  }) || null;
}

function findMimoSubmitButton() {
  const explicit = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"]'))
    .find(isVisibleMimoElement);
  if (explicit) return explicit;
  return Array.from(document.querySelectorAll('button')).find((element) => {
    if (!isVisibleMimoElement(element)) return false;
    return MIMO_REGISTER_SUBMIT_TEXT_PATTERN.test(getMimoElementText(element));
  }) || null;
}

function findMimoCodeSubmitButton() {
  const explicit = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"]'))
    .find((element) => isVisibleMimoElement(element) && !element.disabled);
  if (explicit) return explicit;
  const primaryButtons = Array.from(document.querySelectorAll('button.miui-btn-primary, .miui-btn.miui-btn-primary'))
    .filter((element) => isVisibleMimoElement(element) && !element.disabled);
  if (primaryButtons.length) {
    return primaryButtons.find((element) => MIMO_CODE_SUBMIT_TEXT_PATTERN.test(getMimoElementText(element))) || primaryButtons.at(-1);
  }
  return findMimoClickableByText(MIMO_CODE_SUBMIT_TEXT_PATTERN);
}

function isMimoRegisterHost() {
  return /(?:^|\.)account\.xiaomi\.com$/i.test(location.hostname);
}

function getMimoPageState() {
  if (findMimoCodeInput()) return 'verification_code_entry';
  if (findMimoHumanVerification()) return 'human_verification';
  const emailInput = findMimoEmailInput();
  const passwordInputs = findMimoPasswordInputs();
  if (emailInput && passwordInputs.length) return 'register_form';
  if (emailInput) return 'email_entry';
  if (passwordInputs.length) return 'register_form';
  return 'unknown';
}

async function openMimoSignupPage() {
  if (!isMimoRegisterHost() || !/\/register/i.test(location.pathname)) {
    location.href = MIMO_SIGNUP_URL;
    return { submitted: true, state: 'navigating', url: location.href };
  }
  await waitForMimo(() => findMimoEmailInput() || findMimoPasswordInputs().length, { timeoutMs: 30000 });
  return { submitted: true, state: getMimoPageState(), url: location.href };
}

function getMimoFormErrorText() {
  const text = String(document.body?.innerText || '').trim();
  const patterns = [
    /该邮箱已[^\n]*(?:注册|被使用|存在)[^\n]*/i,
    /邮箱[^\n]*(?:已存在|不可用|格式不正确)[^\n]*/i,
    /this\s*email[^\n]*(?:already|exists|in\s*use)[^\n]*/i,
    /密码[^\n]*(?:不一致|不符合|太弱)[^\n]*/i,
    /password[^\n]*(?:do not match|too weak|invalid)[^\n]*/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].trim();
  }
  return '';
}

function fillMimoField(input, value) {
  if (!input) return;
  try { input.focus(); } catch (_error) { /* ignore */ }
  fillInput(input, value);
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  // 触发失焦：让校验框架把字段标记为已填写/已触碰，从而启用提交按钮
  try { input.blur(); } catch (_error) { /* ignore */ }
  input.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

async function clickMimoRegisterSubmit() {
  const button = await waitForMimo(findMimoSubmitButton, { timeoutMs: 10000, intervalMs: 400 });
  if (button) {
    simulateMimoClick(button);
  }
  return button;
}

async function submitMimoRegisterForm(payload = {}) {
  const email = String(payload.email || '').trim();
  const password = String(payload.password || '');
  if (!email) throw new Error('缺少小米注册邮箱。');
  if (!password) throw new Error('缺少小米注册密码。');

  // 1. 先勾选协议，避免后续弹出"同意並繼續"确认弹窗
  await waitForMimo(() => findMimoAgreementCheckboxes().length, { timeoutMs: 15000, intervalMs: 300 });
  let agreementResult = checkMimoAgreementCheckboxes();
  // 部分受控组件首次点击未必立即生效，未全部选中时重试一次
  if (agreementResult.total && agreementResult.checked < agreementResult.total) {
    await sleep(400);
    agreementResult = checkMimoAgreementCheckboxes();
  }
  await sleep(300);

  // 2. 填邮箱
  const emailInput = await waitForMimo(findMimoEmailInput, { timeoutMs: 45000 });
  if (!emailInput) throw new Error('未找到小米邮箱输入框。');
  fillMimoField(emailInput, email);
  await sleep(200);

  // 3. 填密码（注册页通常为密码 + 确认密码两个框）
  const passwordInputs = await waitForMimo(() => {
    const inputs = findMimoPasswordInputs();
    return inputs.length ? inputs : null;
  }, { timeoutMs: 30000 });
  if (!passwordInputs?.length) throw new Error('未找到小米密码输入框。');
  passwordInputs.forEach((input) => fillMimoField(input, password));
  await sleep(300);

  // 4. 提交表单（等待提交按钮可用后点击；按钮始终禁用时回退原生表单提交）
  const submitButton = await clickMimoRegisterSubmit();
  if (!submitButton) throw new Error('未找到可用的小米注册提交按钮。');
  await sleep(1500);

  // 防御：万一仍弹出"同意並繼續"确认按钮，点掉它
  const consentButton = findMimoConsentConfirmButton();
  if (consentButton) {
    simulateMimoClick(consentButton);
    await sleep(800);
  }

  const errorText = getMimoFormErrorText();
  if (errorText) {
    throw new Error(errorText);
  }
  // 提交后可能进入人机验证或跳转到验证码页；长时间等待与跳转判定交给后台轮询处理
  return { submitted: true, state: getMimoPageState(), url: location.href };
}

function getMimoVerificationErrorText() {
  const text = String(document.body?.innerText || '').trim();
  const patterns = [
    /(?:verification|confirmation)?\s*code\s*(?:is\s*)?(?:invalid|incorrect|expired)[^\n]*/i,
    /invalid\s*(?:verification|confirmation)?\s*code[^\n]*/i,
    /验证码[^\n]*(?:错误|无效|过期)[^\n]*/i,
    /驗證碼[^\n]*(?:錯誤|無效|過期)[^\n]*/i,
    /代码[^\n]*(?:错误|无效|过期)[^\n]*/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].trim();
  }
  return '';
}

async function submitMimoVerificationCode(payload = {}) {
  const normalizedCode = String(payload.code || '').replace(/[^A-Za-z0-9]/g, '').trim();
  if (!normalizedCode) throw new Error('缺少小米邮箱验证码。');
  const codeInput = await waitForMimo(findMimoCodeInput, { timeoutMs: 15000 });
  if (!codeInput) {
    // 找不到验证码输入框：页面很可能已提交并跳转。返回当前状态，由后台按页面状态判定，避免重发到新页报错
    return { submitted: true, state: getMimoPageState(), url: location.href };
  }
  fillInput(codeInput, normalizedCode);
  await sleep(300);
  const button = findMimoCodeSubmitButton();
  if (button) {
    simulateMimoClick(button);
  }
  // 点击提交后立即返回：提交通常触发整页跳转，若在此处 await 等待，会因内容脚本被销毁导致响应丢失、后台一直等到超时而卡住。
  // 跳转/成功判定一律交给后台按页面状态轮询。
  return { submitted: true, state: getMimoPageState(), url: location.href };
}

function extractMimoCookieFromDocument() {
  const raw = String(document.cookie || '');
  const parts = [];
  for (const name of MIMO_REQUIRED_COOKIE_NAMES) {
    const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match?.[1]) {
      parts.push(`${name}=${decodeURIComponent(match[1])}`);
    }
  }
  return parts.join('; ');
}

async function extractMimoCookie() {
  const cookieValue = extractMimoCookieFromDocument();
  return {
    submitted: true,
    state: cookieValue ? 'cookie_found' : getMimoPageState(),
    cookieValue,
    url: location.href,
  };
}

async function clickMimoVerifyEmailSend() {
  const button = await waitForMimo(() => findMimoClickableByText(MIMO_SEND_TEXT_PATTERN), { timeoutMs: 15000, intervalMs: 400 });
  if (!button) throw new Error('未找到二次邮箱验证的发送信件按钮。');
  simulateMimoClick(button);
  await sleep(800);
  return { submitted: true, state: getMimoPageState(), url: location.href };
}

async function executeMimoCommand(command, payload = {}) {
  switch (command) {
    case 'mimo-open-signup-page':
      return openMimoSignupPage(payload);
    case 'mimo-submit-register-form':
      return submitMimoRegisterForm(payload);
    case 'mimo-submit-verification-code':
      return submitMimoVerificationCode(payload);
    case 'mimo-verify-email-send':
      return clickMimoVerifyEmailSend(payload);
    case 'mimo-extract-cookie':
      return extractMimoCookie(payload);
    case 'GET_PAGE_STATE':
      return { state: getMimoPageState(), url: location.href };
    default:
      throw new Error(`未知小米注册命令：${command}`);
  }
}

if (!document.documentElement.hasAttribute(MIMO_REGISTER_PAGE_LISTENER_SENTINEL)) {
  document.documentElement.setAttribute(MIMO_REGISTER_PAGE_LISTENER_SENTINEL, '1');
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'EXECUTE_NODE' && message?.type !== 'GET_PAGE_STATE') return false;
    resetStopState();
    const command = message.command || message.nodeId || message.type;
    executeMimoCommand(command, message.payload || {})
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        if (isStopError(error)) {
          sendResponse({ stopped: true, error: error.message });
          return;
        }
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
    return true;
  });
}

window.__MULTIPAGE_MIMO_REGISTER_PAGE__ = {
  executeMimoCommand,
  getMimoPageState,
};
