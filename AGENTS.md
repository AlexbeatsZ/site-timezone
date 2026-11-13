# Goal

Maintain a self-contained Tampermonkey userscript that gives websites configurable fixed IANA timezones and synchronizes rules through GitHub.

# Current State

- Project is `/Users/meta/Project/Scripts/JavaScript/site-timezone`, owned by AlexbeatsZ.
- Version 1.0.0. Entry and release artifact are `site-timezone.user.js`. No bundling is required.
- Public repository and update source are `https://github.com/AlexbeatsZ/site-timezone` on main.
- Default rules give Telegram and local Stapxs QQ Lite port 8081 Asia/Shanghai, and selected US AI platforms America/Los_Angeles.
- This project is independent of `proxy-timezone-sync`. Users must disable overlapping older timezone scripts when installing.
- GitHub configuration lives in `config.json`. Tokens are per-browser GM storage and must never enter repository files, exports or page DOM.

# Active Work

- Real logged-in Telegram, QQ and AI-platform visual acceptance remains separate from automated checks.
- Browser installation and a user-provisioned fine-grained GitHub Token are user steps. Public configuration pulls work without a token.

# Build / Run / Test

- Node 20+. `npm ci` installs project-only development dependencies.
- `npm run check`, `npm test`, `npm run test:browser`.
- Browser tests launch existing macOS Google Chrome through Playwright, with isolated storage and synthetic pages.
- Install the raw `.user.js` link in Tampermonkey. Changes take effect after reloading the page.
- Before publishing, regenerate `config.json` from exported `DEFAULT_CONFIG`, bump metadata/package version, inspect staged diff, commit and push main, then attach `.user.js` and `config.json` to a matching GitHub release.

# Durable Lessons

- Native `Date` parsing in the host timezone can normalize DST gaps before conversion. Parse timezone-less ISO date-times as UTC wall fields first.
- Multiple timezone scripts patching the same realm stack wrappers and can produce inconsistent results. Disable the old script and reload the page.
- A successful sync updates stored rules. Existing page constructors remain fixed until navigation/reload to keep cached formatters consistent.

# Docs Index

- `docs/design/timezone-and-sync.md` describes rule matching, Date behavior, synchronization and limitations.
