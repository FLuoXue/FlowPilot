const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadPublisher() {
  const source = fs.readFileSync('flows/mimo/background/publisher-mimo2api.js', 'utf8');
  const scope = {};
  new Function('self', `${source}; return self;`)(scope);
  return scope.MultiPageBackgroundMimoPublisherMimo2Api;
}

const publisher = loadPublisher();

test('uploadMimoAccountToMimo2Api uses Bearer auth and posts account fields to /admin/api/accounts in a single call', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ code: 0, message: 'ok' }),
    };
  };

  const result = await publisher.uploadMimoAccountToMimo2Api(
    'https://mimo.example.com',
    'admin-secret',
    { xiaomichatbot_serviceToken: 'st', userId: 'uid', xiaomichatbot_ph: 'ph', name: 'a@b.com', password: 'pw' },
    fetchImpl
  );

  // 不再有 /admin/login 登录步骤：整个上传只发一次请求。
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://mimo.example.com/admin/api/accounts');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer admin-secret');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  // 不再依赖 Cookie 鉴权。
  assert.notEqual(calls[0].options.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    xiaomichatbot_serviceToken: 'st',
    userId: 'uid',
    xiaomichatbot_ph: 'ph',
    name: 'a@b.com',
    password: 'pw',
  });
  assert.equal(result.endpointUrl, 'https://mimo.example.com/admin/api/accounts');
});

test('uploadMimoAccountToMimo2Api throws when admin password is missing (no request sent)', async () => {
  let called = false;
  await assert.rejects(
    () => publisher.uploadMimoAccountToMimo2Api(
      'https://mimo.example.com',
      '',
      { serviceToken: 'st' },
      async () => { called = true; return { ok: true, text: async () => '{}' }; }
    ),
    /缺少 mimo2api 管理密码/
  );
  assert.equal(called, false);
});

test('uploadMimoAccountToMimo2Api surfaces server error message on non-ok response', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    text: async () => JSON.stringify({ error: '管理密码错误' }),
  });
  await assert.rejects(
    () => publisher.uploadMimoAccountToMimo2Api('https://mimo.example.com', 'wrong', { serviceToken: 'st' }, fetchImpl),
    /mimo2api 账号上传失败：管理密码错误/
  );
});

test('buildMimoAccountPayload includes optional name/password only when present', () => {
  assert.deepEqual(
    publisher.buildMimoAccountPayload({ xiaomichatbot_serviceToken: 'st', userId: 'uid', xiaomichatbot_ph: 'ph' }, '', ''),
    { xiaomichatbot_serviceToken: 'st', userId: 'uid', xiaomichatbot_ph: 'ph' }
  );
  assert.deepEqual(
    publisher.buildMimoAccountPayload({ xiaomichatbot_serviceToken: 'st', userId: 'uid', xiaomichatbot_ph: 'ph' }, '备注', 'pw'),
    { xiaomichatbot_serviceToken: 'st', userId: 'uid', xiaomichatbot_ph: 'ph', name: '备注', password: 'pw' }
  );
});

test('parseMimoCookieValues reads the three values from cookies array or cookie string', () => {
  assert.deepEqual(
    publisher.parseMimoCookieValues({ mimoCookies: ['xiaomichatbot_serviceToken=st', 'userId=uid', 'xiaomichatbot_ph=ph'] }),
    { xiaomichatbot_serviceToken: 'st', userId: 'uid', xiaomichatbot_ph: 'ph' }
  );
  assert.deepEqual(
    publisher.parseMimoCookieValues({ mimoCookie: 'xiaomichatbot_serviceToken=st2; userId=uid2; xiaomichatbot_ph=ph2' }),
    { xiaomichatbot_serviceToken: 'st2', userId: 'uid2', xiaomichatbot_ph: 'ph2' }
  );
});

test('parseMimoCookieValues strips RFC6265 surrounding double quotes (Xiaomi quoted cookie tokens)', () => {
  // 还原真实问题：xiaomichatbot_serviceToken / xiaomichatbot_ph 被服务端用双引号包裹下发，userId 不带引号。
  assert.deepEqual(
    publisher.parseMimoCookieValues({
      mimoCookies: ['xiaomichatbot_serviceToken="/vjQa88+abc/=="', 'userId=6877030629', 'xiaomichatbot_ph="ZD7zZ6==/q=="'],
    }),
    { xiaomichatbot_serviceToken: '/vjQa88+abc/==', userId: '6877030629', xiaomichatbot_ph: 'ZD7zZ6==/q==' }
  );
  // 组合 cookie 字符串路径同样去掉包裹引号。
  assert.deepEqual(
    publisher.parseMimoCookieValues({ mimoCookie: 'xiaomichatbot_serviceToken="t1"; userId=uid; xiaomichatbot_ph="p1"' }),
    { xiaomichatbot_serviceToken: 't1', userId: 'uid', xiaomichatbot_ph: 'p1' }
  );
});

test('uploadMimoAccountToMimo2Api body carries unquoted tokens end-to-end', async () => {
  // 端到端：从带引号的 cookie 解析出 token -> 组装 payload -> 上传 body 不应再有多余引号。
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, statusText: 'OK', text: async () => '{}' };
  };
  const cookieValues = publisher.parseMimoCookieValues({
    mimoCookies: ['xiaomichatbot_serviceToken="tok+/=="', 'userId=6877030629', 'xiaomichatbot_ph="ph=="'],
  });
  const payload = publisher.buildMimoAccountPayload(cookieValues, 'elmolongcw@hotmail.com', 'pw');
  await publisher.uploadMimoAccountToMimo2Api('https://mimo.example.com', 'admin-secret', payload, fetchImpl);

  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.xiaomichatbot_serviceToken, 'tok+/==');
  assert.equal(sentBody.xiaomichatbot_ph, 'ph==');
  assert.equal(sentBody.userId, '6877030629');
  assert.doesNotMatch(calls[0].options.body, /\\"/);
});
