(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HistoryGuardProUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const INTERVALS = [1, 5, 15, 30, 60];
  const THEMES = ['midnight','ocean','emerald','purple','glass','minimal'];

  function normalizeDomain(raw) {
    try {
      const input = String(raw || '').trim();
      const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
      const url = new URL(withProtocol);
      return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    } catch { return ''; }
  }

  function normalizeRule(rule) {
    const type = rule?.type === 'domain' ? 'domain' : 'url';
    if (type === 'domain') return {type, value: normalizeDomain(rule.value)};
    try {
      const url = new URL(String(rule?.value || ''));
      url.hash = '';
      url.hostname = url.hostname.toLowerCase();
      return {type, value: url.toString()};
    } catch { return {type, value: ''}; }
  }

  function ruleMatches(candidate, rule) {
    if (!/^https?:\/\//i.test(candidate || '')) return false;
    const normalized = normalizeRule(rule);
    if (!normalized.value) return false;
    if (normalized.type === 'domain') {
      try {
        const host = new URL(candidate).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
        return host === normalized.value || host.endsWith(`.${normalized.value}`);
      } catch { return false; }
    }
    try {
      const c = new URL(candidate); c.hash = ''; c.hostname = c.hostname.toLowerCase();
      return c.toString() === normalized.value;
    } catch { return false; }
  }

  function buildSettings(input) {
    const interval = Number(input?.intervalMinutes);
    const intervalMinutes = Number.isFinite(interval) ? INTERVALS.find(v => v >= interval) || 60 : 1;
    const theme = THEMES.includes(input?.theme) ? input.theme : 'midnight';
    return {
      autoDelete: input?.autoDelete === true,
      intervalMinutes,
      historyOnVisit: input?.historyOnVisit !== false,
      stealthMode: input?.stealthMode === true,
      theme,
      pinHash: typeof input?.pinHash === 'string' ? input.pinHash : '',
      pinEnabled: input?.pinEnabled === true,
      siteWipe: input?.siteWipe === true,
      deleteOldDays: Math.min(365, Math.max(0, Number(input?.deleteOldDays) || 0)),
      deleteOnStartup: input?.deleteOnStartup === true,
      customRules: Array.isArray(input?.customRules) ? input.customRules.slice(0, 100) : [],
      dailyCleanupTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(input?.dailyCleanupTime || '') ? input.dailyCleanupTime : '',
      browserMode: ['auto','chrome','coccoc','chromium'].includes(input?.browserMode) ? input.browserMode : 'auto',
      wipeData: {
        history: true,
        cache: input?.wipeData?.cache === true,
        cookies: input?.wipeData?.cookies === true,
        localStorage: input?.wipeData?.localStorage === true,
        indexedDB: input?.wipeData?.indexedDB === true,
        serviceWorkers: input?.wipeData?.serviceWorkers === true
      }
    };
  }

  async function hashPin(pin) {
    const data = new TextEncoder().encode(String(pin));
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function isPinValid(pin, expectedHash) {
    if (!expectedHash) return false;
    return (await hashPin(pin)) === expectedHash;
  }

  function createExportPayload(rules, settings, stats, now) {
    return {schema: 'history-guard-pro', version: 1, exportedAt: now ?? Date.now(), rules: rules || [], settings: settings || {}, stats: stats || {}};
  }

  function applyImportPayload(payload, currentRules) {
    if (!payload || payload.schema !== 'history-guard-pro' || payload.version !== 1 || !Array.isArray(payload.rules)) {
      throw new Error('Tệp sao lưu không hợp lệ.');
    }
    const map = new Map();
    for (const raw of [...(currentRules || []), ...payload.rules]) {
      const rule = normalizeRule(raw);
      if (!rule.value) continue;
      map.set(`${rule.type}:${rule.value}`, {...rule, id: raw.id || `hg-${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Number(raw.createdAt) || Date.now()});
    }
    return {rules: [...map.values()].slice(0, 500), settings: buildSettings(payload.settings || {})};
  }

  function summarizeRule(rule) {
    const normalized = normalizeRule(rule);
    return `${normalized.type.toUpperCase()} · ${normalized.value}`;
  }

  function getThemeClass(theme) { return THEMES.includes(theme) ? `theme-${theme}` : 'theme-midnight'; }

  function domainFromUrl(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  }

  return { normalizeDomain, normalizeRule, ruleMatches, buildSettings, hashPin, isPinValid, createExportPayload, applyImportPayload, summarizeRule, getThemeClass, domainFromUrl, INTERVALS, THEMES };
});
