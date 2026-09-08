const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const utils = require('../src/pro-utils.js');

test('domain rule matches exact host and subdomains, but not lookalikes', () => {
  const rule = {type: 'domain', value: 'example.com'};
  assert.equal(utils.ruleMatches('https://example.com/a', rule), true);
  assert.equal(utils.ruleMatches('https://www.example.com/a', rule), true);
  assert.equal(utils.ruleMatches('https://sub.example.com/a', rule), true);
  assert.equal(utils.ruleMatches('https://example.com.evil.test/a', rule), false);
});

test('url rule ignores fragment but preserves path and query', () => {
  const rule = {type: 'url', value: 'https://example.com/a?q=1'};
  assert.equal(utils.ruleMatches('https://example.com/a?q=1#section', rule), true);
  assert.equal(utils.ruleMatches('https://example.com/a?q=2', rule), false);
});

test('settings normalize interval, theme, browser and wipe flags', () => {
  const s = utils.buildSettings({intervalMinutes: 17, theme: 'purple', browserMode: 'coccoc', wipeData:{cache:true}});
  assert.equal(s.intervalMinutes, 30);
  assert.equal(s.theme, 'purple');
  assert.equal(s.browserMode, 'coccoc');
  assert.equal(s.wipeData.history, true);
  assert.equal(s.wipeData.cache, true);
});

test('PIN hashing is deterministic', async () => {
  const a = await utils.hashPin('1234');
  const b = await utils.hashPin('1234');
  const c = await utils.hashPin('1235');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test('import payload merges normalized rules without duplicates', () => {
  const current = [{id:'a', type:'domain', value:'example.com'}];
  const payload = {schema:'history-guard-pro', version:1, rules:[
    {type:'domain', value:'www.example.com'},
    {type:'url', value:'https://example.com/a#x'},
    {type:'url', value:'https://example.com/a'}
  ], settings:{}};
  const result = utils.applyImportPayload(payload, current);
  assert.equal(result.rules.length, 2);
  assert.equal(result.rules.some(r=>r.type==='domain' && r.value==='example.com'), true);
  assert.equal(result.rules.some(r=>r.type==='url' && r.value==='https://example.com/a'), true);
});

test('all manifest referenced files exist', () => {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const refs = [manifest.background.service_worker, manifest.action.default_popup, manifest.side_panel.default_path, manifest.options_ui.page, ...Object.values(manifest.icons)];
  for (const rel of refs) assert.equal(fs.existsSync(path.join(root, rel)), true, rel);
});
