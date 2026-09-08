# History Guard Pro 3.0 — Ultimate Privacy

Chrome/Cốc Cốc Manifest V3 extension for history cleanup and restore protection.

## Included
- Continuous Auto Delete with interval scheduling and daily schedule.
- Delete current page, protect URL, protect entire domain/subdomains.
- Restore Guard using tabs/history/navigation/session events.
- Restore Center for recently closed sessions.
- Wipe Now for history plus optional cache/cookies/storage/service workers.
- Site Wipe for a chosen origin: browsing data via `browsingData` and matching history entries via `history.search/deleteUrl`.
- Smart Rules: URL contains or domain matching with delete/protect/site-wipe actions.
- PIN Lock (SHA-256 hash stored locally), Stealth Mode and themes.
- Activity log, statistics, JSON export/import, context-menu quick actions.
- Side Panel and dedicated Settings page.
- Toolbar badge showing Auto Delete status.
- v1/v2 protected-entry migration.

## Install
1. Unzip the archive.
2. Open the browser extension manager.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select the extracted folder that directly contains `manifest.json`.

## Test
Run `npm test` from the project root. The repository contains unit and static regression tests for rule matching, settings normalization, PIN hashing, import merging, manifest references, and sensitive-action PIN gates.

## Important platform limits
- The extension cannot replace Chrome/Cốc Cốc's system `Ctrl+Shift+T` shortcut. Restore Guard detects restored tabs/sessions and closes protected URLs as soon as the browser exposes them to the extension APIs.
- There is no reliable browser-close event for extensions, so "wipe on startup" is supported instead of claiming to wipe after the browser has already terminated.
- PIN Lock is an extension-level privacy gate, not operating-system security; someone who can inspect the extension profile can inspect locally stored extension data.
