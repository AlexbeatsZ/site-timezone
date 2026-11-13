const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const test = require('node:test');
const script = require('../site-timezone.user.js');

function realm(timeZone) {
    const context = vm.createContext({});
    const target = vm.runInContext('globalThis', context);
    script.installTimezone(target, timeZone);
    return expression => vm.runInContext(expression, context);
}

test('default configuration and released config.json agree', () => {
    assert.deepEqual(script.validateConfig(script.DEFAULT_CONFIG), JSON.parse(readFileSync(require.resolve('../config.json'), 'utf8')));
});

test('matches exact hosts, subdomains, ports and paths without lookalike domains', () => {
    const match = script.compilePattern('https://*.chatgpt.com/*');
    assert.equal(match('https://chatgpt.com/'), true);
    assert.equal(match('https://chat.chatgpt.com/c/1?x=1'), true);
    assert.equal(match('https://chatgpt.com.evil.example/'), false);
    assert.equal(match('http://chatgpt.com/'), false);
    assert.equal(script.compilePattern('http://localhost:8081/*')('http://localhost:8080/'), false);
    assert.equal(script.findRule(script.DEFAULT_CONFIG, 'https://web.telegram.org/k/').timeZone, 'Asia/Shanghai');
    assert.equal(script.findRule(script.DEFAULT_CONFIG, 'http://100.106.169.46:8081/').timeZone, 'Asia/Shanghai');
    assert.equal(script.findRule(script.DEFAULT_CONFIG, 'https://aistudio.google.com/prompts/new_chat').timeZone, 'America/Los_Angeles');
    assert.equal(script.findRule(script.DEFAULT_CONFIG, 'https://google.com/'), null);
    assert.equal(script.findRule({ ...script.DEFAULT_CONFIG, enabled: false }, 'https://chatgpt.com/'), null);
});

test('configuration validation rejects malformed URLs, unknown timezones and credentials', () => {
    for (const pattern of ['https://example.com', 'ftp://example.com/*', 'https://user:secret@example.com/*', 'https://exa mple.com/*']) {
        assert.throws(() => script.compilePattern(pattern));
    }
    assert.throws(() => script.validateConfig({ ...script.DEFAULT_CONFIG, rules: [{ name: 'a', enabled: true, patterns: ['https://a.com/*'], timeZone: 'Missing/Zone' }] }));
    assert.throws(() => script.validateSync({ owner: 'x', repo: 'y', branch: 'main', path: '../token' }));
    assert.equal(script.validateConfig({ ...script.DEFAULT_CONFIG, token: 'secret' }).token, undefined);
});

test('Shanghai calendar display preserves epoch, UTC, JSON and explicit timezones', () => {
    const run = realm('Asia/Shanghai');
    assert.equal(run('new Intl.DateTimeFormat().resolvedOptions().timeZone'), 'Asia/Shanghai');
    assert.equal(run('new Date("2026-11-13T00:00:00Z").getHours()'), 8);
    assert.equal(run('new Date("2026-11-13T00:00:00Z").getTimezoneOffset()'), -480);
    assert.equal(run('new Date("2026-11-13T00:00:00Z").getUTCHours()'), 0);
    assert.equal(run('new Date("2026-11-13T00:00:00Z").toISOString()'), '2026-11-13T00:00:00.000Z');
    assert.equal(run('new Date("2026-11-13T00:00:00Z").toJSON()'), '2026-11-13T00:00:00.000Z');
    assert.equal(run('new Date("2026-11-13T00:00:00").toISOString()'), '2026-11-12T16:00:00.000Z');
    assert.equal(run('new Date(2026,10,13,0,0,0).toISOString()'), '2026-11-12T16:00:00.000Z');
    assert.equal(run('new Date("2026-11-13").toISOString()'), '2026-11-13T00:00:00.000Z');
    assert.equal(run('new Intl.DateTimeFormat("en", {timeZone:"UTC"}).resolvedOptions().timeZone'), 'UTC');
    assert.equal(run('new Intl.DateTimeFormat("en", Object.create({timeZone:"Asia/Tokyo"})).resolvedOptions().timeZone'), 'Asia/Tokyo');
    assert.equal(run('new Date(0).toLocaleTimeString("en-GB", {timeZone:"UTC"})'), '00:00:00');
    assert.equal(run('Date.parse === Date.parse'), true);
    assert.equal(run('new Date() instanceof Date'), true);
    assert.equal(run('new Date().constructor === Date'), true);
    assert.equal(run('class CustomDate extends Date {}; new CustomDate(2026,0,1) instanceof CustomDate'), true);
});

test('Los Angeles DST offsets, duplicate hours and missing hours follow native behavior', () => {
    const run = realm('America/Los_Angeles');
    assert.equal(run('new Date("2026-01-15T12:00:00Z").getTimezoneOffset()'), 480);
    assert.equal(run('new Date("2026-07-15T12:00:00Z").getTimezoneOffset()'), 420);
    assert.equal(run('new Date("2026-03-08T02:30:00").toISOString()'), '2026-03-08T10:30:00.000Z');
    assert.equal(run('new Date("2026-11-01T01:30:00").toISOString()'), '2026-11-01T08:30:00.000Z');
    assert.equal(run('new Date("2026-03-08T01:30:00").setHours(2)'), Date.parse('2026-03-08T10:30:00Z'));
    assert.equal(run('new Date("2026-11-01T00:30:00").setHours(1)'), Date.parse('2026-11-01T08:30:00Z'));
});

test('calendar API matrix agrees with an unmodified native process in the selected timezone', () => {
    const expressions = [
        'new Date(2026,0,1,0,0,0,12).getTime()',
        'new Date(99,0,1).getTime()',
        'new Date(2026,12,40,26,80,70).getTime()',
        'new Date("2026-03-08T02:30:00").getTime()',
        'new Date("2026-11-01T01:30:00").getTime()',
        'new Date("2026-01-01T00:00:00+08:00").getTime()',
        'new Date("0001-01-01T00:00:00Z").getFullYear()',
        'new Date("0000-01-01T00:00:00Z").getFullYear()',
        'new Date(-123456789).getTimezoneOffset()',
        'new Date("2026-11-13T00:00:00Z").toString()',
        'new Date("2026-11-13T00:00:00Z").toDateString()',
        'new Date("2026-11-13T00:00:00Z").toLocaleString("zh-CN")',
        'new Date("2026-11-13T00:00:00Z").toLocaleDateString("en-US")',
        'new Date("2026-11-13T00:00:00Z").toLocaleTimeString("en-GB")',
        'new Date("2026-01-01T00:00:00Z").setMonth(2,8)',
        'new Date("2026-01-01T00:00:00Z").setFullYear(2027,11,30)',
        'new Date("2026-01-01T00:00:00Z").setMinutes(123)',
        'new Date("2026-01-01T00:00:00Z").setSeconds(123,4)',
        'new Date("2026-01-01T00:00:00Z").setMilliseconds(-1200)',
        'new Date(NaN).setFullYear(2026)',
        'new Date(NaN).setYear(99)',
        'new Date(NaN).setHours(12)',
        'new Date(NaN).getHours()',
        'new Date(NaN).getTimezoneOffset()',
        'new Date(NaN).toString()',
        'new Date(0).setYear(0)',
        'new Date(0).setYear(99.9)',
        'new Date(0).getYear()',
        'new Date("2011-12-30T12:00:00").getTime()'
    ];
    for (const timeZone of ['Asia/Shanghai', 'America/Los_Angeles', 'Australia/Lord_Howe', 'Pacific/Apia', 'UTC']) {
        const expected = JSON.parse(execFileSync(process.execPath, ['-e', `console.log(JSON.stringify([${expressions.join(',\n')}]))`], { env: { ...process.env, TZ: timeZone }, encoding: 'utf8' }));
        const run = realm(timeZone);
        const actual = JSON.parse(run(`JSON.stringify([${expressions.join(',\n')}])`));
        expressions.forEach((expression, index) => assert.deepEqual(actual[index], expected[index], timeZone + ' ' + expression));
    }
});

test('GitHub encoding preserves Chinese and exports only recognized configuration fields', () => {
    assert.deepEqual(script.decodeContent(script.encodeContent(script.DEFAULT_CONFIG)), script.DEFAULT_CONFIG);
});
