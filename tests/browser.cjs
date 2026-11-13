const assert = require('node:assert/strict');
const { mkdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');
const { DEFAULT_CONFIG, encodeContent } = require('../site-timezone.user.js');

async function main() {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const source = readFileSync(join(__dirname, '../site-timezone.user.js'), 'utf8');
    const fixture = `
        window.__menus = new Map();
        window.__store = new Map();
        window.__nativeDate = Date;
        window.__nativeFormat = Intl.DateTimeFormat;
        window.unsafeWindow = window;
        window.GM_getValue = (key, fallback) => window.__store.has(key) ? structuredClone(window.__store.get(key)) : fallback;
        window.GM_setValue = (key, value) => window.__store.set(key, structuredClone(value));
        window.GM_addValueChangeListener = () => {};
        window.GM_registerMenuCommand = (name, callback) => window.__menus.set(name, callback);
        window.GM_xmlhttpRequest = request => queueMicrotask(() => request.onload({
            status: 200, finalUrl: request.url,
            responseText: JSON.stringify({ encoding: 'base64', sha: 'fixture', content: ${JSON.stringify(encodeContent(DEFAULT_CONFIG))} })
        }));
        const nativeAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function (options) {
            const root = nativeAttachShadow.call(this, options);
            window.__timezoneTestRoot = root;
            return root;
        };
    `;
    try {
        const context = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 1200, height: 1000 } });
        const errors = [];
        context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
        await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh-CN"><head><title>Timezone fixture</title></head><body><h1>Timezone fixture</h1><script>window.__earlyTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone</script></body></html>' }));
        await context.addInitScript({ content: fixture + '\n' + source });
        const page = await context.newPage();
        for (const [url, expected] of [
            ['https://web.telegram.org/k/', 'Asia/Shanghai'],
            ['http://100.106.169.46:8081/', 'Asia/Shanghai'],
            ['https://chatgpt.com/', 'America/Los_Angeles'],
            ['https://claude.ai/new', 'America/Los_Angeles'],
            ['https://grok.com/', 'America/Los_Angeles'],
            ['https://gemini.google.com/app', 'America/Los_Angeles'],
            ['https://aistudio.google.com/prompts/new_chat', 'America/Los_Angeles'],
            ['https://example.com/', 'UTC']
        ]) {
            await page.goto(url);
            assert.equal(await page.evaluate(() => window.__earlyTimezone), expected, url);
            assert.equal(await page.evaluate(() => new Intl.DateTimeFormat().resolvedOptions().timeZone), expected, url);
        }
        assert.equal(await page.evaluate(() => Date === window.__nativeDate && Intl.DateTimeFormat === window.__nativeFormat), true);

        await page.goto('https://chatgpt.com/');
        const calendar = await page.evaluate(() => ({
            winter: new Date('2026-01-01T00:00:00Z').getTimezoneOffset(),
            summer: new Date('2026-07-01T00:00:00Z').getTimezoneOffset(),
            gap: new Date('2026-03-08T02:30:00').toISOString(),
            fold: new Date('2026-11-01T01:30:00').toISOString(),
            explicit: new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai' }).resolvedOptions().timeZone
        }));
        assert.deepEqual(calendar, { winter: 480, summer: 420, gap: '2026-03-08T10:30:00.000Z', fold: '2026-11-01T08:30:00.000Z', explicit: 'Asia/Shanghai' });
        await page.evaluate(() => [...window.__menus].find(([name]) => name.includes('网站时区设置'))[1]());
        assert.equal(await page.evaluate(() => window.__timezoneTestRoot.querySelectorAll('.rule').length), DEFAULT_CONFIG.rules.length);
        assert.equal(await page.evaluate(() => window.__timezoneTestRoot.querySelector('input[type=password]')), null);
        mkdirSync(join(__dirname, '../test-results'), { recursive: true });
        await page.screenshot({ path: join(__dirname, '../test-results/settings-desktop.png'), fullPage: true });

        await page.evaluate(() => window.__timezoneTestRoot.querySelector('[data-add]').click());
        await page.evaluate(() => {
            const root = window.__timezoneTestRoot;
            const row = root.querySelector('.rule:last-child');
            row.querySelector('[data-zone]').value = 'Asia/Tokyo';
            root.querySelector('[data-save]').click();
        });
        assert.equal(await page.evaluate(() => window.__store.get('site-timezone.state.v1').config.rules.at(-1).timeZone), 'Asia/Tokyo');
        assert.match(await page.evaluate(() => window.__timezoneTestRoot.querySelector('[data-status]').textContent), /刷新网页/);

        const downloadPromise = page.waitForEvent('download');
        await page.evaluate(() => window.__timezoneTestRoot.querySelector('[data-export]').click());
        const download = await downloadPromise;
        const downloaded = JSON.parse(readFileSync(await download.path(), 'utf8'));
        assert.equal(downloaded.rules.at(-1).timeZone, 'Asia/Tokyo');
        assert.equal(downloaded.token, undefined);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => { window.__timezoneTestRoot.querySelector('.dialog').scrollTop = 0; });
        await page.screenshot({ path: join(__dirname, '../test-results/settings-mobile.png'), fullPage: true });
        assert.equal(await page.evaluate(() => {
            const dialog = window.__timezoneTestRoot.querySelector('.dialog');
            return dialog.scrollWidth <= dialog.clientWidth;
        }), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => window.__timezoneTestRoot.host.isConnected), false);
        assert.deepEqual(errors, []);
        console.log('Chromium smoke passed: 8 site rules, document-start, Date/Intl, DST, editor, save, JSON export, desktop/mobile layout, Escape.');
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
