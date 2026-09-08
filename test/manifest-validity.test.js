const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('manifest short_name stays within Chrome extension limit', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.equal(typeof manifest.short_name, 'string');
  assert.ok(manifest.short_name.length <= 12, `short_name is ${manifest.short_name.length} characters`);
});

test('manifest references an existing service worker', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const worker = manifest.background?.service_worker;
  assert.equal(typeof worker, 'string');
  assert.ok(fs.existsSync(path.join(__dirname, '..', worker)), `missing ${worker}`);
});
