// ==UserScript==
// @name         网站时区 · Site Timezone
// @namespace    https://github.com/AlexbeatsZ/site-timezone
// @version      1.0.0
// @description  为不同网站指定时区，预设上海 / 洛杉矶，支持规则编辑与 GitHub 配置同步
// @author       AlexbeatsZ
// @license      MIT
// @homepageURL  https://github.com/AlexbeatsZ/site-timezone
// @supportURL   https://github.com/AlexbeatsZ/site-timezone/issues
// @updateURL    https://raw.githubusercontent.com/AlexbeatsZ/site-timezone/main/site-timezone.user.js
// @downloadURL  https://raw.githubusercontent.com/AlexbeatsZ/site-timezone/main/site-timezone.user.js
// @match        http://*/*
// @match        https://*/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_CONFIG = {
        version: 1,
        enabled: true,
        rules: [
            { name: 'Telegram', enabled: true, patterns: ['https://web.telegram.org/*'], timeZone: 'Asia/Shanghai' },
            { name: '本地 Stapxs QQ Lite', enabled: true, patterns: [
                'http://localhost:8081/*', 'http://127.0.0.1:8081/*',
                'http://100.106.169.46:8081/*', 'http://100.113.70.121:8081/*',
                'http://100.64.2.94:8081/*'
            ], timeZone: 'Asia/Shanghai' },
            { name: 'ChatGPT / OpenAI', enabled: true, patterns: ['https://*.chatgpt.com/*', 'https://*.openai.com/*'], timeZone: 'America/Los_Angeles' },
            { name: 'Claude / Anthropic', enabled: true, patterns: ['https://*.claude.ai/*', 'https://*.claude.com/*', 'https://*.anthropic.com/*'], timeZone: 'America/Los_Angeles' },
            { name: 'Grok', enabled: true, patterns: ['https://*.grok.com/*', 'https://*.x.ai/*', 'https://x.com/i/grok*'], timeZone: 'America/Los_Angeles' },
            { name: 'Gemini / AI Studio / NotebookLM', enabled: true, patterns: [
                'https://gemini.google.com/*', 'https://aistudio.google.com/*',
                'https://ai.google.dev/*', 'https://notebooklm.google.com/*', 'https://notebooklm.google/*'
            ], timeZone: 'America/Los_Angeles' },
            { name: 'Perplexity / Copilot / Poe', enabled: true, patterns: [
                'https://*.perplexity.ai/*', 'https://copilot.microsoft.com/*', 'https://*.copilot.com/*', 'https://*.poe.com/*'
            ], timeZone: 'America/Los_Angeles' }
        ]
    };

    function validateConfig(input) {
        if (!input || input.version !== 1 || typeof input.enabled !== 'boolean' || !Array.isArray(input.rules) || input.rules.length > 200) {
            throw new Error('配置须包含 version = 1、enabled 和 rules 数组，最多 200 条规则。');
        }
        const rules = input.rules.map(rule => {
            if (!rule || typeof rule.name !== 'string' || rule.name.length > 100 || typeof rule.enabled !== 'boolean' ||
                !Array.isArray(rule.patterns) || !rule.patterns.length || rule.patterns.length > 100 || typeof rule.timeZone !== 'string') {
                throw new Error('每条规则须包含名称、启用状态、网址列表和 IANA 时区。');
            }
            new Intl.DateTimeFormat('en', { timeZone: rule.timeZone });
            rule.patterns.forEach(compilePattern);
            return { name: rule.name, enabled: rule.enabled, patterns: [...rule.patterns], timeZone: rule.timeZone };
        });
        return { version: 1, enabled: input.enabled, rules };
    }

    function compilePattern(pattern) {
        if (typeof pattern !== 'string' || pattern.length > 500) throw new Error('网址规则过长或类型无效。');
        const match = /^(https?|\*):\/\/(\*|(?:\*\.)?[^/*?#\s]+)(\/[^#\s]*)$/.exec(pattern);
        if (!match) throw new Error('网址规则无效，请使用 https://*.example.com/* 或 http://localhost:8081/*。');
        const [, scheme, authority, path] = match;
        const base = authority.replace(/^\*\./, '');
        if (authority !== '*') {
            const parsed = new URL('http://' + base);
            if (parsed.host !== base.toLowerCase() || parsed.username || parsed.password) throw new Error('网址的域名或端口无效。');
        }
        const pathRegex = new RegExp('^' + path.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        return url => {
            const parsed = new URL(url);
            if (scheme !== '*' && parsed.protocol !== scheme + ':') return false;
            if (!['http:', 'https:'].includes(parsed.protocol)) return false;
            const host = parsed.host.toLowerCase();
            const wanted = base.toLowerCase();
            const hostMatches = authority === '*' || host === wanted || (authority.startsWith('*.') && host.endsWith('.' + wanted));
            return hostMatches && pathRegex.test(parsed.pathname + parsed.search);
        };
    }

    function findRule(config, url) {
        if (!config.enabled) return null;
        return config.rules.find(rule => rule.enabled && rule.patterns.some(pattern => compilePattern(pattern)(url))) || null;
    }

    // Use the target realm's constructors, including for objects created before injection.
    // Local operations share one conversion so constructors, getters and setters agree.
    function installTimezone(target, timeZone) {
        const NativeDate = target.Date;
        const NativeFormat = target.Intl.DateTimeFormat;
        const prototype = NativeDate.prototype;
        const original = Object.fromEntries(Object.getOwnPropertyNames(prototype).map(key => [key, prototype[key]]));
        const partsFormatter = new NativeFormat('en-US-u-ca-gregory-nu-latn', {
            timeZone, era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        });
        const zoneNameFormatter = new NativeFormat('en-US', { timeZone, timeZoneName: 'long' });
        const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let cachedSecond = null;
        let cachedOffset = null;

        function utcFields(year, month, day, hour, minute, second) {
            const date = new NativeDate(0);
            original.setUTCFullYear.call(date, year, month - 1, day);
            original.setUTCHours.call(date, hour, minute, second, 0);
            return original.getTime.call(date);
        }

        function offsetAt(timestamp) {
            if (!Number.isFinite(timestamp)) return NaN;
            const second = Math.floor(timestamp / 1000) * 1000;
            if (second === cachedSecond) return cachedOffset;
            const parts = Object.fromEntries(partsFormatter.formatToParts(timestamp).map(part => [part.type, part.value]));
            const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
            const localTimestamp = utcFields(year, Number(parts.month), Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
            cachedSecond = second;
            cachedOffset = localTimestamp - second;
            return cachedOffset;
        }

        function localDate(date) {
            const timestamp = original.getTime.call(date);
            return new NativeDate(timestamp + offsetAt(timestamp));
        }

        function wallToTimestamp(wallTimestamp) {
            if (!Number.isFinite(wallTimestamp)) return NaN;
            // Sampling both sides of the wall time handles DST folds/gaps and date-line jumps.
            const offsets = new Set([-2, -1, 0, 1, 2].map(day => offsetAt(wallTimestamp + day * 86400000)));
            const candidates = [...offsets].map(offset => wallTimestamp - offset);
            const exact = candidates.filter(timestamp => timestamp + offsetAt(timestamp) === wallTimestamp);
            if (exact.length) return Math.min(...exact);
            const after = candidates.filter(timestamp => timestamp + offsetAt(timestamp) > wallTimestamp);
            return Math.min(...after);
        }

        function parseLocal(text) {
            if (/^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) {
                return wallToTimestamp(NativeDate.parse(text + 'Z'));
            }
            const timestamp = NativeDate.parse(text);
            if (!Number.isFinite(timestamp)) return timestamp;
            // ECMAScript date-only ISO strings are UTC. Explicit offsets remain authoritative.
            const explicitZone = /(?:z|[+-]\d{2}:?\d{2})\s*$|\b(?:GMT|UTC|[ECMP][SD]T)\b/i.test(text);
            const dateOnly = /^(?:\d{4}|[+-]\d{6})(?:-\d{2}(?:-\d{2})?)?$/.test(text.trim());
            if (explicitZone || dateOnly) return timestamp;
            const date = new NativeDate(timestamp);
            const wall = utcFields(original.getFullYear.call(date), original.getMonth.call(date) + 1,
                original.getDate.call(date), original.getHours.call(date), original.getMinutes.call(date), original.getSeconds.call(date));
            return wallToTimestamp(wall + original.getMilliseconds.call(date));
        }

        function optionsWithZone(options) {
            if (options === null) throw new TypeError('Cannot convert null to object');
            if (options !== undefined && options.timeZone !== undefined) return options;
            return Object.defineProperty(Object.create(options === undefined ? null : Object(options)), 'timeZone', { value: timeZone });
        }

        target.Intl.DateTimeFormat = new Proxy(NativeFormat, {
            apply(constructor, receiver, args) {
                return Reflect.apply(constructor, receiver, [args[0], optionsWithZone(args[1])]);
            },
            construct(constructor, args, newTarget) {
                return Reflect.construct(constructor, [args[0], optionsWithZone(args[1])], newTarget);
            }
        });

        function replace(name, method) {
            Object.defineProperty(method, 'name', { value: name, configurable: true });
            Object.defineProperty(prototype, name, { value: method, writable: true, configurable: true });
        }

        for (const field of ['FullYear', 'Month', 'Date', 'Day', 'Hours', 'Minutes', 'Seconds', 'Milliseconds']) {
            replace('get' + field, function () { return original['getUTC' + field].call(localDate(this)); });
        }
        replace('getYear', function () { return original.getUTCFullYear.call(localDate(this)) - 1900; });
        replace('getTimezoneOffset', function () { return -offsetAt(original.getTime.call(this)) / 60000; });

        for (const field of ['FullYear', 'Month', 'Date', 'Hours', 'Minutes', 'Seconds', 'Milliseconds']) {
            replace('set' + field, function (...args) {
                let date = localDate(this);
                if (field === 'FullYear' && Number.isNaN(original.getTime.call(date))) date = new NativeDate(0);
                const wallTimestamp = Reflect.apply(original['setUTC' + field], date, args);
                return original.setTime.call(this, wallToTimestamp(wallTimestamp));
            });
        }
        replace('setYear', function (value) {
            let year = Math.trunc(+value);
            if (year >= 0 && year <= 99) year += 1900;
            return this.setFullYear(year);
        });

        function dateString(date) {
            const local = localDate(date);
            const year = original.getUTCFullYear.call(local);
            return weekday[original.getUTCDay.call(local)] + ' ' + months[original.getUTCMonth.call(local)] + ' ' +
                String(original.getUTCDate.call(local)).padStart(2, '0') + ' ' +
                (year < 0 ? '-' + String(-year).padStart(4, '0') : String(year).padStart(4, '0'));
        }

        function timeString(date) {
            const timestamp = original.getTime.call(date);
            const local = localDate(date);
            const offset = offsetAt(timestamp) / 60000;
            const absolute = Math.abs(Math.trunc(offset));
            const clock = ['Hours', 'Minutes', 'Seconds'].map(field => String(original['getUTC' + field].call(local)).padStart(2, '0')).join(':');
            const name = zoneNameFormatter.formatToParts(timestamp).find(part => part.type === 'timeZoneName').value;
            return clock + ' GMT' + (offset >= 0 ? '+' : '-') + String(Math.floor(absolute / 60)).padStart(2, '0') +
                String(absolute % 60).padStart(2, '0') + ' (' + name + ')';
        }

        replace('toDateString', function () { return Number.isNaN(original.getTime.call(this)) ? 'Invalid Date' : dateString(this); });
        replace('toTimeString', function () { return Number.isNaN(original.getTime.call(this)) ? 'Invalid Date' : timeString(this); });
        replace('toString', function () { return Number.isNaN(original.getTime.call(this)) ? 'Invalid Date' : dateString(this) + ' ' + timeString(this); });
        for (const name of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
            replace(name, function (locales, options) { return original[name].call(this, locales, optionsWithZone(options)); });
        }

        const parse = function parse(text) { return parseLocal(String(text)); };
        target.Date = new Proxy(NativeDate, {
            apply() { return prototype.toString.call(new NativeDate()); },
            construct(constructor, args, newTarget) {
                if (args.length >= 2) return Reflect.construct(constructor, [wallToTimestamp(NativeDate.UTC(...args))], newTarget);
                if (typeof args[0] === 'string') return Reflect.construct(constructor, [parseLocal(args[0])], newTarget);
                return Reflect.construct(constructor, args, newTarget);
            },
            get(constructor, property, receiver) {
                if (property === 'parse') return parse;
                return Reflect.get(constructor, property, receiver);
            }
        });
        Object.defineProperty(prototype, 'constructor', { value: target.Date, writable: true, configurable: true });
        return { timeZone };
    }

    function encodeContent(config) {
        const bytes = new TextEncoder().encode(JSON.stringify(config, null, 2) + '\n');
        return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    }

    function decodeContent(content) {
        const bytes = Uint8Array.from(atob(content.replace(/\s/g, '')), char => char.charCodeAt(0));
        return validateConfig(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    }

    function sameConfig(left, right) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    function validateSync(input) {
        if (!input || !/^[A-Za-z0-9-]+$/.test(input.owner) || !/^[A-Za-z0-9_.-]+$/.test(input.repo) ||
            typeof input.branch !== 'string' || !input.branch.trim() || typeof input.path !== 'string' ||
            !input.path || input.path.split('/').some(part => !part || part === '.' || part === '..')) {
            throw new Error('请填写有效的 GitHub 用户、仓库、分支和配置文件路径。');
        }
        return { owner: input.owner, repo: input.repo, branch: input.branch, path: input.path, autoPull: Boolean(input.autoPull) };
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = { DEFAULT_CONFIG, validateConfig, compilePattern, findRule, installTimezone, encodeContent, decodeContent, sameConfig, validateSync };
        return;
    }

    const STATE_KEY = 'site-timezone.state.v1';
    const SYNC_KEY = 'site-timezone.sync.v1';
    const TOKEN_KEY = 'site-timezone.github-token.v1';
    const NativeFormat = Intl.DateTimeFormat;
    const NativeDate = Date;
    let state = GM_getValue(STATE_KEY, null);
    try {
        if (!state) state = { config: validateConfig(DEFAULT_CONFIG), baseline: null };
        state.config = validateConfig(state.config);
    } catch (error) {
        console.error('[Site Timezone] 配置损坏，使用内置规则', error);
        state = { config: validateConfig(DEFAULT_CONFIG), baseline: null };
    }
    let sync = GM_getValue(SYNC_KEY, { owner: 'AlexbeatsZ', repo: 'site-timezone', branch: 'main', path: 'config.json', autoPull: true });
    let status = '配置保存在本浏览器';
    let panel = null;
    let busy = false;
    const page = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const activeRule = findRule(state.config, location.href);
    const activeTimeZone = activeRule ? activeRule.timeZone : null;
    if (activeTimeZone) {
        try { installTimezone(page, activeTimeZone); }
        catch (error) { console.error('[Site Timezone] 时区覆盖失败', error); }
    }

    function readState() {
        return GM_getValue(STATE_KEY, state);
    }

    function saveConfig(config, baseline = readState().baseline) {
        state = { config: validateConfig(config), baseline };
        GM_setValue(STATE_KEY, state);
    }

    function dirty(current = readState()) {
        return !sameConfig(current.config, current.baseline || DEFAULT_CONFIG);
    }

    function syncIdentity(settings = sync) {
        return [settings.owner, settings.repo, settings.branch, settings.path].join('/');
    }

    function apiUrl() {
        validateSync(sync);
        return 'https://api.github.com/repos/' + encodeURIComponent(sync.owner) + '/' + encodeURIComponent(sync.repo) +
            '/contents/' + sync.path.split('/').map(encodeURIComponent).join('/');
    }

    function request(method, url, body) {
        return new Promise((resolve, reject) => {
            const token = GM_getValue(TOKEN_KEY, '');
            const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
            if (token) headers.Authorization = 'Bearer ' + token;
            if (body) headers['Content-Type'] = 'application/json';
            GM_xmlhttpRequest({
                method, url, headers, anonymous: true, timeout: 20000,
                data: body ? JSON.stringify(body) : undefined,
                onload(response) {
                    try {
                        if (response.finalUrl && new URL(response.finalUrl).origin !== 'https://api.github.com') throw new Error('GitHub 请求出现意外跳转。');
                        const data = JSON.parse(response.responseText);
                        if (response.status < 200 || response.status >= 300) {
                            const error = new Error('GitHub HTTP ' + response.status + '，' + (data.message || '请求失败'));
                            error.status = response.status;
                            throw error;
                        }
                        resolve(data);
                    } catch (error) { reject(error); }
                },
                onerror() { reject(new Error('GitHub 网络连接失败。')); },
                ontimeout() { reject(new Error('GitHub 请求超时。')); },
                onabort() { reject(new Error('GitHub 请求已取消。')); }
            });
        });
    }

    async function remoteConfig() {
        const file = await request('GET', apiUrl() + '?ref=' + encodeURIComponent(sync.branch) + '&t=' + NativeDate.now());
        if (file.encoding !== 'base64' || typeof file.content !== 'string' || typeof file.sha !== 'string') throw new Error('GitHub 文件格式无效。');
        return { config: decodeContent(file.content), sha: file.sha };
    }

    async function pull(manual = false) {
        if (busy) return;
        busy = true;
        const identity = syncIdentity();
        const before = readState();
        try {
            if (dirty(before) && !manual) {
                status = '本地有待上传修改，自动拉取已跳过';
                return;
            }
            const remote = await remoteConfig();
            if (syncIdentity() !== identity || !sameConfig(readState().config, before.config)) throw new Error('请求期间配置已变化，请重新同步。');
            if (dirty(before) && !sameConfig(before.config, remote.config) && !confirm('本地有未上传修改。用 GitHub 配置替换本地规则？')) return;
            saveConfig(remote.config, remote.config);
            status = '已从 GitHub 拉取，' + new NativeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(NativeDate.now());
            if (manual) alert(status + '\n请刷新需要应用新规则的网页。');
        } catch (error) {
            status = error.message;
            if (manual) alert(status);
        } finally {
            busy = false;
            renderStatus();
        }
    }

    async function push() {
        if (busy) return;
        if (!GM_getValue(TOKEN_KEY, '')) return alert('请在设置里填写 GitHub Token，权限选择此仓库的 Contents 读写。');
        busy = true;
        const identity = syncIdentity();
        const before = readState();
        try {
            let remote;
            try { remote = await remoteConfig(); }
            catch (error) { if (error.status !== 404) throw error; }
            if (identity !== syncIdentity()) throw new Error('同步目标已变化，请重试。');
            if (remote && !sameConfig(remote.config, before.baseline || DEFAULT_CONFIG) && !sameConfig(remote.config, before.config)) {
                throw new Error('GitHub 配置已被其他设备修改。请先导出本地规则，再拉取并合并后上传。');
            }
            if (!sameConfig(readState().config, before.config)) throw new Error('请求期间本地规则已变化，请重试。');
            if (!remote || !sameConfig(remote.config, before.config)) {
                await request('PUT', apiUrl(), {
                    message: 'chore(config): 同步网站时区配置', branch: sync.branch,
                    content: encodeContent(before.config), ...(remote ? { sha: remote.sha } : {})
                });
            }
            if (identity !== syncIdentity()) throw new Error('上传已完成，同步目标已变化，请重新拉取当前目标。');
            const latest = readState();
            saveConfig(latest.config, before.config);
            status = '配置已上传到 GitHub';
            alert(status + '\n其他设备会自动拉取，也可从菜单立即拉取。');
        } catch (error) {
            status = error.message;
            alert(status);
        } finally {
            busy = false;
            renderStatus();
        }
    }

    function renderStatus() {
        if (!panel) return;
        const message = panel.querySelector('[data-status]');
        if (message) message.textContent = status + (dirty() ? ' · 有待上传修改' : '');
        panel.querySelectorAll('[data-network]').forEach(button => { button.disabled = busy; });
    }

    function showSettings() {
        if (!document.documentElement) {
            document.addEventListener('DOMContentLoaded', showSettings, { once: true });
            return;
        }
        if (panel) return;
        const host = document.createElement('div');
        host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
        const root = host.attachShadow({ mode: 'closed' });
        panel = root;
        root.innerHTML = `
            <style>
                :host{color-scheme:light}*{box-sizing:border-box} .veil{position:absolute;inset:0;background:#172b4d66;display:flex;align-items:center;justify-content:center;padding:18px}
                .dialog{font:14px/1.5 'Instrument Sans',system-ui,sans-serif;color:#1d3552;background:#f7faff;width:min(950px,100%);max-height:94vh;overflow:auto;border-radius:16px;box-shadow:0 24px 90px #132f4e55}
                header{padding:22px 26px;background:#e6effb;display:flex;justify-content:space-between;align-items:start;gap:20px}h1{font-size:23px;margin:0;font-weight:650}p{margin:5px 0 0;color:#526986}main{padding:20px 26px}h2{font-size:16px;margin:0 0 12px}
                .bar,.actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.bar{justify-content:space-between;margin-bottom:16px}.rule{display:grid;grid-template-columns:24px 1fr 1.3fr auto;gap:10px;border-top:1px solid #d9e3f0;padding:14px 0;align-items:start}.rule textarea{grid-column:2/4;min-height:64px}.rule .remove{grid-column:4;grid-row:1/3}
                input,textarea,button{font:inherit}input[type=text],textarea{width:100%;border:1px solid #bdcde0;border-radius:7px;padding:8px 10px;background:white;color:#1d3552}textarea{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;resize:vertical}input[type=checkbox]{accent-color:#225ec3;margin-top:12px}
                button{border:1px solid #bdcde0;border-radius:7px;padding:8px 13px;background:white;color:#22476e;cursor:pointer}button.primary{background:#225ec3;border-color:#225ec3;color:white}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #76a9ff;outline-offset:2px}
                .sync{border-top:1px solid #d9e3f0;margin-top:22px;padding-top:20px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}label{display:block;font-size:12px;color:#526986}label input{margin-top:4px}.hint{font-size:12px;margin:8px 0 14px}.status{margin:14px 0;font-size:12px;overflow-wrap:anywhere}.footer{border-top:1px solid #d9e3f0;padding-top:18px;justify-content:space-between}.error{color:#b42332;white-space:pre-wrap}
                @media(max-width:600px){.veil{padding:8px}header,main{padding:16px}.fields{grid-template-columns:1fr}.rule{grid-template-columns:22px 1fr auto}.rule input[data-zone]{grid-column:2;grid-row:2}.rule textarea{grid-column:2;grid-row:3}.rule .remove{grid-column:3;grid-row:1/4}h1{font-size:20px}}
            </style>
            <div class="veil"><section class="dialog" role="dialog" aria-modal="true" aria-label="网站时区设置">
                <header><div><h1>网站时区</h1><p data-current></p></div><button data-close aria-label="关闭设置">关闭</button></header>
                <main><div class="bar"><label><input type="checkbox" data-enabled> 启用网站时区</label><button data-add>添加网站规则</button></div>
                <p class="hint">按从上到下的顺序匹配第一条启用规则。每行一个网址，* 匹配任意字符，*.example.com 包含主域名。保存后刷新网页。</p>
                <div data-rules></div><datalist id="zones"><option>Asia/Shanghai</option><option>America/Los_Angeles</option><option>Asia/Tokyo</option><option>Europe/London</option><option>UTC</option></datalist>
                <section class="sync"><h2>GitHub 同步</h2><div class="fields">
                <label>GitHub 用户<input type="text" data-owner autocomplete="off"></label><label>仓库<input type="text" data-repo autocomplete="off"></label>
                <label>分支<input type="text" data-branch autocomplete="off"></label><label>配置文件路径<input type="text" data-path autocomplete="off"></label></div>
                <p class="hint">公开仓库可直接拉取。上传所需 Token 从油猴菜单的“设置 GitHub Token”填写，单独保存在本浏览器的脚本存储。上传前先保存设置。</p>
                <label><input type="checkbox" data-auto> 自动拉取，每 15 分钟检查一次</label>
                <div class="actions"><button data-pull data-network>从 GitHub 拉取</button><button data-push data-network>上传到 GitHub</button><button data-export>导出规则</button><button data-import>导入规则</button></div>
                <p data-status class="status" role="status"></p></section><p data-error class="error" role="alert"></p>
                <div class="actions footer"><button data-reset>恢复预设规则</button><button class="primary" data-save>保存设置</button></div>
                </main></section></div>`;
        const query = selector => root.querySelector(selector);
        const current = readState();
        query('[data-current]').textContent = location.host + ' · ' + (activeTimeZone || '系统时区');
        query('[data-enabled]').checked = current.config.enabled;
        query('[data-auto]').checked = sync.autoPull;
        for (const key of ['owner', 'repo', 'branch', 'path']) query('[data-' + key + ']').value = sync[key];

        function addRule(rule) {
            const row = document.createElement('div');
            row.className = 'rule';
            row.innerHTML = '<input type="checkbox" data-rule-enabled aria-label="启用规则"><input type="text" data-name aria-label="规则名称" placeholder="网站名称"><input type="text" data-zone list="zones" aria-label="IANA 时区" placeholder="Asia/Shanghai"><button class="remove" aria-label="删除规则">删除</button><textarea data-patterns aria-label="网址规则" placeholder="https://*.example.com/*"></textarea>';
            row.querySelector('[data-rule-enabled]').checked = rule.enabled;
            row.querySelector('[data-name]').value = rule.name;
            row.querySelector('[data-zone]').value = rule.timeZone;
            row.querySelector('[data-patterns]').value = rule.patterns.join('\n');
            row.querySelector('button').onclick = () => row.remove();
            query('[data-rules]').append(row);
        }
        current.config.rules.forEach(addRule);
        const previousFocus = document.activeElement;
        function close() {
            host.remove();
            panel = null;
            document.removeEventListener('keydown', onKeydown, true);
            previousFocus?.focus();
        }
        function onKeydown(event) {
            if (event.key === 'Escape') { event.stopPropagation(); close(); }
            if (event.key !== 'Tab') return;
            const focusable = [...root.querySelectorAll('button:not(:disabled),input,textarea')];
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        query('[data-close]').onclick = close;
        query('.veil').onclick = event => { if (event.target === query('.veil')) close(); };
        query('[data-add]').onclick = () => addRule({ name: location.host, enabled: true, timeZone: 'Asia/Shanghai', patterns: [location.origin + '/*'] });
        query('[data-save]').onclick = () => {
            try {
                const config = validateConfig({ version: 1, enabled: query('[data-enabled]').checked, rules: [...root.querySelectorAll('.rule')].map(row => ({
                    name: row.querySelector('[data-name]').value.trim(), enabled: row.querySelector('[data-rule-enabled]').checked,
                    timeZone: row.querySelector('[data-zone]').value.trim(), patterns: row.querySelector('[data-patterns]').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
                })) });
                const settings = validateSync({ owner: query('[data-owner]').value.trim(), repo: query('[data-repo]').value.trim(),
                    branch: query('[data-branch]').value.trim(), path: query('[data-path]').value.trim(), autoPull: query('[data-auto]').checked });
                const changedTarget = syncIdentity(settings) !== syncIdentity();
                saveConfig(config, changedTarget ? null : readState().baseline);
                sync = settings;
                GM_setValue(SYNC_KEY, sync);
                query('[data-error]').textContent = '';
                status = '已保存，刷新网页后应用';
                renderStatus();
            } catch (error) { query('[data-error]').textContent = error.message; }
        };
        query('[data-pull]').onclick = async () => { await pull(true); close(); showSettings(); };
        query('[data-push]').onclick = push;
        query('[data-export]').onclick = () => {
            const blob = new Blob([JSON.stringify(readState().config, null, 2) + '\n'], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'site-timezone-config.json';
            root.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        query('[data-import]').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = async () => {
                try {
                    const file = input.files[0];
                    if (!file || file.size > 1024 * 1024) throw new Error('请选择小于 1 MB 的 JSON 文件。');
                    const config = validateConfig(JSON.parse(await file.text()));
                    query('[data-enabled]').checked = config.enabled;
                    query('[data-rules]').replaceChildren();
                    config.rules.forEach(addRule);
                    status = '已导入到编辑器，请保存设置';
                    renderStatus();
                } catch (error) { query('[data-error]').textContent = error.message; }
            };
            input.click();
        };
        query('[data-reset]').onclick = () => {
            if (!confirm('在编辑器中恢复预设网站规则？保存设置后生效。')) return;
            query('[data-enabled]').checked = true;
            query('[data-rules]').replaceChildren();
            DEFAULT_CONFIG.rules.forEach(addRule);
        };
        document.documentElement.append(host);
        document.addEventListener('keydown', onKeydown, true);
        query('[data-close]').focus();
        renderStatus();
    }

    // Menus are available on all HTTP(S) pages so arbitrary sites can be configured.
    if (window.top !== window.self) return;
    GM_registerMenuCommand('⚙ 网站时区设置', showSettings);
    GM_registerMenuCommand('📍 指定此网站时区', () => {
        const value = prompt('为 ' + location.origin + ' 指定 IANA 时区，例如 Asia/Shanghai 或 America/Los_Angeles。', activeTimeZone || 'Asia/Shanghai');
        if (value === null) return;
        try {
            const current = readState();
            const pattern = location.origin + '/*';
            const config = validateConfig({ ...current.config, enabled: true, rules: [
                { name: location.host, enabled: true, patterns: [pattern], timeZone: value.trim() },
                ...current.config.rules.filter(rule => !(rule.patterns.length === 1 && rule.patterns[0] === pattern))
            ] });
            saveConfig(config);
            alert('已保存，请刷新网页后应用。需要跨设备同步时，从菜单上传到 GitHub。');
        } catch (error) { alert(error.message); }
    });
    GM_registerMenuCommand('☁ 从 GitHub 拉取配置', () => pull(true));
    GM_registerMenuCommand('↑ 上传配置到 GitHub', push);
    GM_registerMenuCommand('🔑 设置 GitHub Token', () => {
        const token = prompt('填写 GitHub Fine-grained Token，仅选择同步仓库并授予 Contents 读写权限。留空清除本浏览器已保存的 Token。', '');
        if (token === null) return;
        GM_setValue(TOKEN_KEY, token.trim());
        alert(token.trim() ? 'Token 已保存在本浏览器。' : '已清除本浏览器的 Token。');
    });
    GM_registerMenuCommand('🕒 查看当前时区', () => alert('网站 ' + location.href + '\n当前页面时区 ' + new page.Intl.DateTimeFormat().resolvedOptions().timeZone +
        '\n匹配规则 ' + (activeRule?.name || '系统默认') + '\n页面时间 ' + new page.Date().toString() + '\n配置变化后请刷新网页。'));
    GM_addValueChangeListener(STATE_KEY, (_key, _old, value) => { if (value) state = value; });
    GM_addValueChangeListener(SYNC_KEY, (_key, _old, value) => { if (value) sync = value; });

    let lastCheck = 0;
    function autoPull() {
        if (!sync.autoPull || document.hidden || NativeDate.now() - lastCheck < 15 * 60000) return;
        const lastGlobal = GM_getValue('site-timezone.last-pull.v1', 0);
        if (NativeDate.now() - lastGlobal < 15 * 60000) return;
        lastCheck = NativeDate.now();
        GM_setValue('site-timezone.last-pull.v1', lastCheck);
        pull(false);
    }
    setTimeout(autoPull, 1500);
    setInterval(autoPull, 60000);
    document.addEventListener('visibilitychange', autoPull);
})();
