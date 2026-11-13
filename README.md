# 网站时区 · Site Timezone

可配置的 Tampermonkey 油猴脚本。为不同网站指定 IANA 时区，并通过 GitHub 同步网站规则。

## 安装

浏览器安装并启用 [Tampermonkey](https://www.tampermonkey.net/)，打开下方脚本链接，点击安装，然后重新加载目标网页。

**[安装或更新脚本](https://raw.githubusercontent.com/AlexbeatsZ/site-timezone/main/site-timezone.user.js)**

[版本发布与下载](https://github.com/AlexbeatsZ/site-timezone/releases/latest) · [默认配置](https://github.com/AlexbeatsZ/site-timezone/blob/main/config.json)

脚本包含 `@updateURL` 和 `@downloadURL`，Tampermonkey 可以检查后续代码更新。Chrome 使用 Tampermonkey 时，请确保扩展已获得“允许用户脚本”权限，入口以扩展当前提示为准。

如果已经安装旧的 `Proxy Timezone Sync` 或其他时区覆盖脚本，请停用与本脚本重叠的规则，并重新加载网页。多个 Date/Intl 覆盖实现叠加会产生冲突。

## 预设

| 网站 | 时区 |
| --- | --- |
| Telegram Web | `Asia/Shanghai` |
| 本地 Stapxs QQ Lite，8081 端口 | `Asia/Shanghai` |
| ChatGPT / OpenAI | `America/Los_Angeles` |
| Claude / Anthropic | `America/Los_Angeles` |
| Grok / x.ai / X 的 `/i/grok` 路径 | `America/Los_Angeles` |
| Gemini / Google AI Studio / NotebookLM | `America/Los_Angeles` |
| Perplexity / Microsoft Copilot / Poe | `America/Los_Angeles` |

QQ 预设包含 localhost、127.0.0.1 及用户三台设备的 Tailscale 地址，端口均为 8081。通过不同域名、HTTPS 或其他端口访问时，可从菜单添加对应规则。

洛杉矶按 IANA 数据库自动切换夏令时。未匹配的网页使用其原有时区。脚本在所有 HTTP(S) 页面提供菜单，便于添加任意网站。

## 配置

点击浏览器工具栏的 Tampermonkey 图标，进入本脚本的菜单。

- **网站时区设置**打开编辑面板，可以增加、修改、删除和启停规则，也可以导入、导出 JSON。
- **指定此网站时区**为当前 origin 添加一条高优先级规则。例如输入 `Asia/Shanghai` 或 `America/Los_Angeles`。
- **查看当前时区**显示当前页面实际报告的时区、匹配规则和页面时间。

网址匹配支持以下写法，每行一条。

```text
https://web.telegram.org/*
https://*.chatgpt.com/*
http://localhost:8081/*
http://100.106.169.46:8081/*
```

`*.example.com` 同时匹配主域名与子域名。规则从上到下选第一条启用的匹配项。端口参与匹配。路径包含查询字符串，`*` 匹配任意字符。

**保存、导入或同步配置后，需要重新加载目标网页以应用。** 编辑器里的改动需点击“保存设置”才进入本地配置。

## GitHub 同步

### 使用默认同步仓库

默认目标为 `AlexbeatsZ/site-timezone` 的 `main` 分支下 `config.json`。新设备安装同一脚本后，可以从公开仓库拉取规则。

自动拉取默认启用。打开网页后检查一次，随后在有可见网页时每 15 分钟检查。脚本使用浏览器内共享节流，网络失败时继续使用已保存规则。本地有未上传修改时，会跳过自动拉取。

### 从浏览器上传配置

1. 在 [GitHub Fine-grained Token 页面](https://github.com/settings/personal-access-tokens/new)创建 Token。
2. Resource owner 选 `AlexbeatsZ`，Repository access 只选 `site-timezone`，Repository permissions 里给 `Contents` 选择 `Read and write`。账号需要对此仓库有写权限。
3. 从油猴菜单点击**设置 GitHub Token**，粘贴 Token。每个需要访问私有仓库或上传的浏览器分别配置。
4. 编辑网站规则并**保存设置**。
5. 点击**上传配置到 GitHub**。其他设备可等待自动拉取，或点击**从 GitHub 拉取配置**。
6. 在目标网页重新加载，应用新时区。

Token 单独保存到该浏览器的油猴脚本存储。规则 JSON、导出文件和仓库提交仅包含网站配置。设置 Token 时留空可以清除本浏览器已保存的值。

同步使用 GitHub Contents API。上传时会检查上次同步后的远端变更，并带文件 SHA 写入。多设备修改发生冲突时，会提示先导出本地、拉取远端并合并。

也可以直接在 GitHub 编辑 `config.json`，浏览器会按相同流程拉取。

### 自定义同步仓库

在设置里修改 GitHub 用户、仓库、分支和配置文件路径，然后保存。公开仓库可直接拉取，私有仓库需要对应的 Token。脚本支持向目标分支创建配置文件，仓库和分支需要已存在。切换到已有配置的仓库后，先拉取规则。

规则同步目标与脚本代码更新地址分别保存。自定义同步仓库后，脚本代码仍通过本项目的更新链接获取。

## 覆盖范围

覆盖网页主线程的默认 `Intl.DateTimeFormat`、Date 本地 getter/setter、常用字符串输出、无时区 ISO 日期时间解析和多参数 Date 构造。普通 epoch、UTC 方法、带明确偏移的时间字符串、显式指定 timeZone 的格式化按各自语义处理。

服务端预格式化的时间文本、网站自行固定的时区、Worker / Service Worker、about:blank / srcdoc iframe 和浏览器内部页面受各自实现控制。X 从其他路径站内跳转到 Grok 时，需要重新加载以匹配 Grok 规则。Telegram、QQ 和 AI 网站的具体页面可能同时使用多种时间来源，需在实际页面验收。

非 ISO 日期字符串由浏览器原生解析器兼容处理，跨浏览器建议采用 ISO 8601。JavaScript Date 接近极限年份的日期范围未验证。

## 开发与验证

```sh
npm ci
npm run check
npm test
npm run test:browser
```

浏览器测试通过 Playwright 启动本机 Chrome，使用独立上下文与合成页面。测试依赖仅安装在项目内。用户脚本为独立文件，无需运行 Node 或本地服务器。

运行原理和同步设计见 [设计文档](docs/design/timezone-and-sync.md)。
