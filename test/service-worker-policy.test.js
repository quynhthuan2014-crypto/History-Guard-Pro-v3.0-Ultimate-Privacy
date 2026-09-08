const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'service-worker.js'), 'utf8');

test('sensitive context-menu actions pass through the PIN gate', () => {
  assert.match(source, /hgp-wipe-all[^\n]*requirePinForSensitive/);
  assert.match(source, /hgp-protect-url[^\n]*requirePinForSensitive/);
  assert.match(source, /hgp-protect-domain[^\n]*requirePinForSensitive/);
  assert.match(source, /hgp-wipe-site[^\n]*requirePinForSensitive/);
});

test('protect-current and clean-current pass through the PIN gate', () => {
  assert.match(source, /m\.type!==\'delete-current\'\) await requirePinForSensitive\(m\)/);
});

test('restore-session resolves the full recent session before checking protected URLs', () => {
  assert.match(source, /findRecentSession\(m\.session\?\.sessionId\)/);
  assert.match(source, /target\?\.window\?\.tabs/);
  assert.match(source, /urls\.some\(u=>ruleForUrl\(u,rules\)\)/);
});

test('disabling an existing PIN requires the current PIN', () => {
  assert.match(source, /if\(cur\.pinEnabled\)\{if\(!\(await requirePin\(m\)\)\)/);
});
