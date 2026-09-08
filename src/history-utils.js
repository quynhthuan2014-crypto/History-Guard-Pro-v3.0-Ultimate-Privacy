function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return String(rawUrl || '');
  }
}

function normalizeHost(rawUrl) {
  try {
    const input = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const host = new URL(input).hostname.toLowerCase().replace(/^www\./, '');
    return host;
  } catch {
    return String(rawUrl || '').toLowerCase().replace(/^www\./, '').split('/')[0];
  }
}

function normalizeDomainValue(value) {
  return normalizeHost(String(value || '').trim());
}

function matchesRule(rawUrl, rule) {
  if (!rawUrl || !rule) return false;
  const rawValue = typeof rule.value === 'string' ? rule.value : (typeof rule.url === 'string' ? rule.url : '');
  if (!rawValue) return false;
  if (rule.type === 'domain') {
    const host = normalizeHost(rawUrl);
    const domain = normalizeDomainValue(rawValue);
    return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
  }
  return normalizeUrl(rawUrl) === normalizeUrl(rawValue);
}

function shouldProtectUrl(rawUrl, entries) {
  return Array.isArray(entries) && entries.some((entry) => matchesRule(rawUrl, entry));
}

function removeRule(entries, target) {
  return (entries || []).filter((entry) => {
    if (!target) return true;
    if (entry.type !== target.type) return true;
    return target.type === 'domain'
      ? normalizeDomainValue(entry.value) !== normalizeDomainValue(target.value)
      : normalizeUrl(entry.value) !== normalizeUrl(target.value);
  });
}

function removeProtectedUrl(entries, rawUrl) {
  return (entries || []).filter((entry) => !matchesRule(rawUrl, entry));
}

function pruneProtected(entries, _now = Date.now(), _ttlMs = Infinity, maxEntries = 500) {
  return (entries || [])
    .filter((entry) => entry && typeof entry.url === 'string')
    .sort((a, b) => Number(b.protectedAt || 0) - Number(a.protectedAt || 0))
    .slice(0, maxEntries);
}

function pruneLogs(logs, now = Date.now(), maxAgeMs = 7 * 24 * 60 * 60 * 1000, maxEntries = 250) {
  return (logs || [])
    .filter((entry) => entry && Number.isFinite(Number(entry.at)) && now - Number(entry.at) <= maxAgeMs)
    .sort((a, b) => Number(b.at) - Number(a.at))
    .slice(0, maxEntries);
}

function buildAutoDeleteSettings(input = {}) {
  const enabled = input.enabled === true;
  const rawInterval = Number(input.intervalMinutes);
  const intervalMinutes = Number.isFinite(rawInterval) ? Math.min(60, Math.max(1, Math.round(rawInterval))) : 1;
  return { enabled, intervalMinutes, enabledAt: enabled ? Number(input.enabledAt) || Date.now() : 0 };
}

function isAutoDeleteEnabled(settings) {
  return settings?.enabled === true;
}

function shouldBlockTabCandidate(tab, entries) {
  const pending = tab?.pendingUrl || '';
  const current = tab?.url || '';
  return shouldProtectUrl(pending, entries) || shouldProtectUrl(current, entries);
}

function getRuleLabel(rule) {
  if (rule?.type === 'domain') return `Domain · ${normalizeDomainValue(rule.value)}`;
  return `URL · ${normalizeUrl(rule?.value || '')}`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizeUrl,
    normalizeHost,
    normalizeDomainValue,
    matchesRule,
    shouldProtectUrl,
    removeRule,
    removeProtectedUrl,
    pruneProtected,
    pruneLogs,
    buildAutoDeleteSettings,
    isAutoDeleteEnabled,
    shouldBlockTabCandidate,
    getRuleLabel,
  };
}
