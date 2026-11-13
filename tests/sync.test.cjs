const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { DEFAULT_CONFIG, encodeContent } = require('../site-timezone.user.js');
const source = readFileSync(require.resolve('../site-timezone.user.js'), 'utf8');
const STATE = 'site-timezone.state.v1';

function fixture(config = DEFAULT_CONFIG, baseline = DEFAULT_CONFIG, url = 'https://example.com/') {
    const store = new Map([[STATE, { config: structuredClone(config), baseline: structuredClone(baseline) }]]);
    const menus = new Map();
    const requests = [];
    const alerts = [];
    const replies = [];
    const timers = [];
    const context = vm.createContext({
        URL, TextEncoder, TextDecoder, atob, btoa, console,
        location: new URL(url),
        document: { hidden: false, addEventListener() {} },
        setTimeout: callback => timers.push(callback), setInterval() {},
        alert: value => alerts.push(value), confirm: () => false,
        GM_getValue: (key, fallback) => structuredClone(store.has(key) ? store.get(key) : fallback),
        GM_setValue: (key, value) => store.set(key, structuredClone(value)),
        GM_addValueChangeListener() {},
        GM_registerMenuCommand: (name, callback) => menus.set(name, callback),
        GM_xmlhttpRequest: request => {
            requests.push(request);
            const response = replies.shift();
            if (!response) throw new Error('Missing mock response');
            queueMicrotask(() => request.onload({ status: response.status || 200,
                finalUrl: request.url, responseText: JSON.stringify(response.body) }));
        }
    });
    vm.runInContext('window = globalThis; window.top = window; window.self = window', context);
    vm.runInContext(source, context);
    return { store, menus, requests, alerts, replies, context, timers,
        file: config => ({ body: { encoding: 'base64', sha: 'abc123', content: encodeContent(config) } }),
        action: text => [...menus].find(([name]) => name.includes(text))[1]() };
}

test('unmatched sites keep native Date/Intl and offer configuration menus', () => {
    const f = fixture();
    assert.equal(vm.runInContext('Date.prototype.getHours.toString().includes("[native code]")', f.context), true);
    assert.equal(f.menus.size, 6);
    assert.equal(f.requests.length, 0);
});

test('bootstraps a matching page using saved rules before timers or network', () => {
    const f = fixture(DEFAULT_CONFIG, DEFAULT_CONFIG, 'https://web.telegram.org/k/');
    assert.equal(vm.runInContext('new Intl.DateTimeFormat().resolvedOptions().timeZone', f.context), 'Asia/Shanghai');
    assert.equal(f.requests.length, 0);
});

test('manual pull applies valid remote config and keeps tokens outside configuration', async () => {
    const f = fixture();
    const remote = { ...DEFAULT_CONFIG, enabled: false };
    f.replies.push(f.file(remote));
    await f.action('从 GitHub');
    assert.deepEqual(f.store.get(STATE).config, remote);
    assert.deepEqual(f.store.get(STATE).baseline, remote);
    assert.equal(f.requests[0].headers.Authorization, undefined);
});

test('manual pull preserves unsynced local edits when replacement is declined', async () => {
    const local = { ...DEFAULT_CONFIG, rules: DEFAULT_CONFIG.rules.slice(1) };
    const f = fixture(local);
    f.replies.push(f.file({ ...DEFAULT_CONFIG, enabled: false }));
    await f.action('从 GitHub');
    assert.deepEqual(f.store.get(STATE).config, local);
});

test('push refuses divergent remote configuration', async () => {
    const local = { ...DEFAULT_CONFIG, rules: DEFAULT_CONFIG.rules.slice(1) };
    const f = fixture(local);
    f.store.set('site-timezone.github-token.v1', 'test-token');
    f.replies.push(f.file({ ...DEFAULT_CONFIG, enabled: false }));
    await f.action('上传配置');
    assert.equal(f.requests.length, 1);
    assert.match(f.alerts.at(-1), /其他设备修改/);
    assert.deepEqual(f.store.get(STATE).config, local);
});

test('push uses SHA and base64, then records uploaded baseline', async () => {
    const local = { ...DEFAULT_CONFIG, enabled: false };
    const f = fixture(local);
    f.store.set('site-timezone.github-token.v1', 'test-token');
    f.replies.push(f.file(DEFAULT_CONFIG), { body: { content: { sha: 'newsha' } } });
    await f.action('上传配置');
    assert.equal(f.requests.length, 2);
    const body = JSON.parse(f.requests[1].data);
    assert.equal(body.sha, 'abc123');
    assert.equal(body.branch, 'main');
    assert.equal(body.content, encodeContent(local));
    assert.equal(f.requests[1].headers.Authorization, 'Bearer test-token');
    assert.equal(f.requests[1].data.includes('test-token'), false);
    assert.deepEqual(f.store.get(STATE).baseline, local);
});

test('GitHub failures retain prior state and report the error', async () => {
    const f = fixture();
    f.replies.push({ status: 403, body: { message: 'API rate limit exceeded' } });
    await f.action('从 GitHub');
    assert.match(f.alerts.at(-1), /403/);
    assert.deepEqual(f.store.get(STATE).config, DEFAULT_CONFIG);
});

test('PUT conflict preserves local edits and prior baseline', async () => {
    const local = { ...DEFAULT_CONFIG, enabled: false };
    const f = fixture(local);
    f.store.set('site-timezone.github-token.v1', 'test-token');
    f.replies.push(f.file(DEFAULT_CONFIG), { status: 409, body: { message: 'sha mismatch' } });
    await f.action('上传配置');
    assert.match(f.alerts.at(-1), /409/);
    assert.deepEqual(f.store.get(STATE).baseline, DEFAULT_CONFIG);
    assert.deepEqual(f.store.get(STATE).config, local);
});

test('automatic pull skips unsynced edits without contacting GitHub', () => {
    const local = { ...DEFAULT_CONFIG, enabled: false };
    const f = fixture(local);
    f.timers[0]();
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.store.get(STATE).config, local);
});

test('push without a token reports the missing setting before a network request', async () => {
    const f = fixture();
    await f.action('上传配置');
    assert.equal(f.requests.length, 0);
    assert.match(f.alerts.at(-1), /Token/);
});

test('push creates a missing configuration file without a SHA', async () => {
    const f = fixture();
    f.store.set('site-timezone.github-token.v1', 'test-token');
    f.replies.push({ status: 404, body: { message: 'Not Found' } }, { body: { content: { sha: 'newsha' } } });
    await f.action('上传配置');
    assert.equal(f.requests.length, 2);
    assert.equal(JSON.parse(f.requests[1].data).sha, undefined);
    assert.deepEqual(f.store.get(STATE).baseline, DEFAULT_CONFIG);
});

test('local edits made while a pull is running remain intact', async () => {
    const f = fixture();
    f.replies.push(f.file({ ...DEFAULT_CONFIG, enabled: false }));
    const pending = f.action('从 GitHub');
    const newer = { ...DEFAULT_CONFIG, rules: DEFAULT_CONFIG.rules.slice(1) };
    f.store.set(STATE, { config: newer, baseline: DEFAULT_CONFIG });
    await pending;
    assert.deepEqual(f.store.get(STATE).config, newer);
    assert.match(f.alerts.at(-1), /请求期间配置已变化/);
});
