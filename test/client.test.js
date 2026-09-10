'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient, FrontpointError } = require('..');
const auth = Object.freeze({ cookie: 'session=secret', ajaxKey: 'ajax-secret', headers: Object.freeze({ Extra: 'preserved' }) });
const json = (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
function transport(responses) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (!next) throw Error('Unexpected request');
    return typeof next === 'function' ? next(url, options) : next;
  }};
}
function loginResponses(cookieHeaders = ['session=cookie-secret; Path=/', 'afg=ajax-secret; Path=/']) {
  const headers = new Headers(); cookieHeaders.forEach(cookie => headers.append('set-cookie', cookie));
  return [json({}, { headers: { 'x-fpsso': 'token-secret' } }),
    json('https://www.alarm.com/sso?ticket=secret-ticket'),
    new Response(null, { status: 302, headers }),
    json({ data: [null, { relationships: { selectedSystem: { data: null } } },
      { relationships: { selectedSystem: { data: { id: 'system-1' } } } },
      { relationships: { selectedSystem: { data: { id: 'system-1' } } } }] })];
}

test('legacy SSO fixture handles a final afg cookie and nullable identity relationships', async () => {
  const mock = transport(loginResponses()); const client = createClient({ fetch: mock.fetch });
  const result = await client.login('username', 'password');
  assert.deepEqual(result.systems, ['system-1']);
  assert.equal(result.ajaxKey, 'ajax-secret');
  assert.equal(result.cookie, 'session=cookie-secret; afg=ajax-secret');
  assert.equal(mock.calls[1].options.headers.Authorization, 'Bearer token-secret');
  assert.equal(mock.calls[2].options.headers.Authorization, undefined);
  assert.equal(mock.calls[3].options.headers.Cookie, result.cookie);
});

test('missing token/cookie errors do not reference undefined variables or disclose secrets', async () => {
  for (const responses of [[json({ secret: 'body-secret' })], loginResponses(['session=cookie-secret; Path=/'])]) {
    const mock = transport(responses);
    await assert.rejects(createClient({ fetch: mock.fetch }).login('username', 'password'), error => {
      assert.ok(error instanceof FrontpointError);
      assert.doesNotMatch(error.message, /body-secret|cookie-secret|token-secret|ReferenceError/);
      return true;
    });
  }
});

test('SSO destinations are constrained to HTTPS on alarm.com', async () => {
  for (const url of ['http://www.alarm.com/sso', 'https://alarm.com.attacker.test/sso', 'http://127.0.0.1/', 'https://user:password@alarm.com/']) {
    const mock = transport([json({}, { headers: { 'x-fpsso': 'token' } }), json(url)]);
    await assert.rejects(createClient({ fetch: mock.fetch }).login('u', 'p'), /HTTPS on alarm.com/);
    assert.equal(mock.calls.length, 2);
  }
});

test('HTTP 403 remains an actionable status and discards sensitive error bodies', async () => {
  const response = json({ Message: 'cookie-secret password-secret token-secret' }, { status: 403 });
  const mock = transport([response]);
  await assert.rejects(createClient({ fetch: mock.fetch }).login('u', 'password-secret'), error => {
    assert.equal(error.status, 403);
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  assert.equal(response.bodyUsed, true);
});

test('arming without options works, disarm sends no arming flags, and auth is not mutated', async () => {
  const mock = transport([json({}), json({}), json({})]); const client = createClient({ fetch: mock.fetch });
  await client.armStay('partition/one', auth);
  await client.armAway('partition/one', auth, { noEntryDelay: true, silentArming: true });
  await client.disarm('partition/one', auth);
  assert.match(mock.calls[0].url, /partition%2Fone\/armStay$/);
  assert.deepEqual(JSON.parse(mock.calls[0].options.body), { noEntryDelay: false, silentArming: false, statePollOnly: false });
  assert.deepEqual(JSON.parse(mock.calls[1].options.body), { noEntryDelay: true, silentArming: true, statePollOnly: false });
  assert.deepEqual(JSON.parse(mock.calls[2].options.body), { statePollOnly: false });
  assert.deepEqual(auth.headers, { Extra: 'preserved' });
});

test('sensor IDs cannot inject additional query parameters and empty lists avoid a request', async () => {
  const mock = transport([json({ data: [] })]); const client = createClient({ fetch: mock.fetch });
  await client.getSensors(['id&other=value', 'id + /'], auth);
  const search = new URL(mock.calls[0].url).searchParams;
  assert.deepEqual(search.getAll('ids[]'), ['id&other=value', 'id + /']);
  assert.equal(search.has('other'), false);
  assert.deepEqual(await client.getSensors([], auth), { data: [] });
  assert.equal(mock.calls.length, 1);
});

test('current-state assembly handles empty relationships and combines partitions/sensors', async () => {
  const mock = transport([
    json({ data: { id: 's', attributes: {}, relationships: {} } }),
    json({ data: { id: 's', attributes: {}, relationships: { partitions: { data: [{ id: 'p' }] }, sensors: { data: [{ id: 'sensor' }] } } } }),
    json({ data: { id: 'p' } }), json({ data: [{ id: 'sensor' }] }),
  ]);
  const client = createClient({ fetch: mock.fetch });
  assert.deepEqual((await client.getCurrentState('s', auth)).sensors, []);
  const result = await client.getCurrentState('s', auth);
  assert.deepEqual(result.partitions, [{ id: 'p' }]); assert.deepEqual(result.sensors, [{ id: 'sensor' }]);
});

test('malformed JSON and transport errors are sanitized', async () => {
  const mock = transport([new Response('secret-invalid-json', { headers: { 'content-type': 'application/json' } })]);
  await assert.rejects(createClient({ fetch: mock.fetch }).getPartition('p', auth), /invalid JSON/);
  await assert.rejects(createClient({ fetch: async () => { throw Error('password-secret'); } }).getPartition('p', auth), error => {
    assert.equal(error.message, 'Network request failed'); return true;
  });
});

test('timeouts and caller cancellation stop the transport without retries', async () => {
  let calls = 0;
  const client = createClient({ timeout: 5, fetch: (url, options) => {
    calls++;
    return new Promise((resolve, reject) => {
      if (options.signal.aborted) return reject(options.signal.reason);
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  }});
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(client.getPartition('p', auth), /aborted or timed out/); }
  finally { clearTimeout(keepAlive); }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.getPartition('p', { ...auth, signal: controller.signal }), /aborted or timed out/);
  assert.equal(calls, 2);
});

test('validates credentials, IDs, client options and authentication', async () => {
  const client = createClient({ fetch: async () => { throw Error('should not request'); } });
  await assert.rejects(client.login('', ''), TypeError);
  await assert.rejects(client.getPartition('', auth), TypeError);
  await assert.rejects(client.getPartition('p', {}), TypeError);
  for (const timeout of [0, -1, Infinity, 1.5]) assert.throws(() => createClient({ timeout }), RangeError);
});
