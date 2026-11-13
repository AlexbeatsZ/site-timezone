# 网站规则与时区

规则按数组顺序匹配第一条启用项。全局关闭或无匹配规则时，保留网页 Date/Intl。规则格式为 `scheme://host/path`，scheme 支持 http、https、*，域名支持 `*` 和 `*.example.com`，后者也包含根域名。路径含查询字符串，支持 *。端口显式匹配。支持脚本菜单在任意 HTTP(S) 网站新增规则。

时区在 document-start 从本地 GM 存储读取并固定到当前 document。同步或编辑后重新加载以应用。每个匹配的 HTTP(S) iframe 在自身 URL 上匹配规则。about:blank、srcdoc、Worker、Service Worker、浏览器/扩展内部页面属于覆盖边界。仅使用 X 的 Grok 路径时，从 X 的其他页面站内跳转到 Grok 后需要重新加载。

使用目标 realm 的原生 Date 和 Intl.DateTimeFormat 捕获实现。通过原生 Intl 的时区数据库计算每个时间点的偏移，支持洛杉矶 DST。getter、setter、字符串显示、无偏移 ISO 日期时间和多参数构造器保持相同的本地时区语义。DST 重复时刻选较早时刻，缺失时刻向前跳过间隙。显式 timezone 的 Intl、带偏移字符串、ISO date-only、UTC 方法、epoch 和 Date.now 保留其时间语义。

非 ISO 日期字符串由浏览器原生解析器兼容处理，其接受格式和异常时间规范化受浏览器及宿主时区影响。精确日期时间应使用 ISO 8601。JS Date 接近 ±8.64e15 ms 的极端日期范围需要额外边界验证。

服务器预格式化的时间、站点显式指定的其他时区、网页图片中的时间无法由此脚本统一转换。客户端调用普通 Date/Intl 默认时区时会应用指定值。本脚本为时间显示和客户端时区配置工具，浏览器外的定位和网络属性遵循各自环境。

# GitHub 配置同步

默认指向 AlexbeatsZ/site-timezone 的 main 分支 config.json。配置文件为版本化 JSON。脚本更新使用稳定 raw 链接，规则同步使用 GitHub Contents REST API。

- 公开仓库拉取使用匿名 API，可选 Token 用于私有仓库和上传。Fine-grained Token 仅需目标仓库 Contents 读写。
- Token 使用单独的 GM key 保存，原生菜单 prompt 输入。配置导入、导出和上传只包含 version/enabled/rules。
- 自动拉取在网页可见时检查，同一浏览器脚本共享 15 分钟节流。仅本地没有未上传修改时自动应用。网络失败继续使用本地配置。
- 手动拉取遇到本地修改需要确认替换，可先导出备份。编辑器中的内容需要先保存再同步。
- 上传先 GET 当前文件，与上次同步基线比较。远端发生其他改动时停止并要求手动合并。PUT 使用 GET 的 SHA，覆盖竞态由 GitHub 409/422 拒绝。无远端文件时创建。
- 请求完成后重新检查本地配置和同步目标。上传期间本地再次修改时保存新本地内容，并将已上传版本记录为基线。
- 多标签页通过 GM 值变化监听共享规则。单次读取/写入 GM 存储没有跨进程事务，GitHub 文件的 SHA 提供远端并发保护。
- 切换同步仓库时清空基线，初次上传到已有不同配置的目标前先拉取并合并。

# 参考

- [Tampermonkey 文档](https://www.tampermonkey.net/documentation.php) 的 document-start、unsafeWindow、GM 存储、菜单及跨域请求 API。
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents) 的 Base64 内容、文件 SHA 和 Contents 权限。
- [ECMAScript Date](https://tc39.es/ecma262/multipage/numbers-and-dates.html) 的 UTC、local time 和 DST 消歧语义。
- 调研了 capta1nLz/ChromeTimezoneSpoofer、faridvatani/timezone-spoofer 及本机 proxy-timezone-sync 的 Date/Intl 覆盖范围，当前实现独立编写。
