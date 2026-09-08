importScripts('history-utils.js', 'pro-utils.js');

const U = globalThis.HistoryGuardProUtils;
const KEYS = {
  rules: 'protectedRules', auto: 'autoDeleteSettings', logs: 'activityLogs', stats: 'stats',
  settings: 'proSettings', smart: 'smartRules', legacy: 'protectedEntries'
};
const ALARMS = { sweep: 'hgp-sweep', schedule: 'hgp-schedule' };
const DEFAULTS = {
  autoDelete: false, intervalMinutes: 1, historyOnVisit: true, stealthMode: false,
  theme: 'midnight', pinHash: '', pinEnabled: false, siteWipe: false, deleteOldDays: 0,
  deleteOnStartup: false, dailyCleanupTime: '', browserMode: 'auto',
  wipeData: {history:true, cache:false, cookies:false, localStorage:false, indexedDB:false, serviceWorkers:false}
};
const STATS_DEFAULT = {deleted:0, blockedRestores:0, unblocked:0, autoDeleted:0, wipes:0, domainRules:0, urlRules:0};
const MAX_RULES = 500, MAX_SMART = 100, MAX_LOGS = 250, LOG_AGE = 7*24*60*60*1000;
let unlockedUntil = 0;

const get = (defaults) => new Promise(r => chrome.storage.local.get(defaults, r));
const set = (values) => new Promise(r => chrome.storage.local.set(values, r));
const queryTabs = (q) => new Promise(r => chrome.tabs.query(q, r));

function now() { return Date.now(); }
function http(url) { return /^https?:\/\//i.test(url || ''); }
function safeUrl(url) { return U.normalizeRule({type:'url', value:url}).value; }
function id() { return globalThis.crypto?.randomUUID?.() || `hg-${now()}-${Math.random().toString(36).slice(2)}`; }

async function getRules() {
  const d = await get({[KEYS.rules]:[]});
  return Array.isArray(d[KEYS.rules]) ? d[KEYS.rules].filter(x => x?.value).slice(0,MAX_RULES) : [];
}
async function setRules(rules) { await set({[KEYS.rules]: rules.slice(0,MAX_RULES)}); }
async function getSmartRules() {
  const d = await get({[KEYS.smart]:[]});
  return Array.isArray(d[KEYS.smart]) ? d[KEYS.smart].slice(0,MAX_SMART) : [];
}
async function setSmartRules(rules) { await set({[KEYS.smart]: rules.slice(0,MAX_SMART)}); }
async function getSettings() { const d = await get({[KEYS.settings]:DEFAULTS}); return U.buildSettings({...DEFAULTS, ...(d[KEYS.settings]||{})}); }
async function setSettings(next) { const merged = U.buildSettings(next); await set({[KEYS.settings]:merged}); return merged; }
async function getAuto() { const s = await getSettings(); return {enabled:s.autoDelete, intervalMinutes:s.intervalMinutes}; }
async function getStats() { const d = await get({[KEYS.stats]:STATS_DEFAULT}); return {...STATS_DEFAULT, ...(d[KEYS.stats]||{})}; }
async function bump(delta) { const s = await getStats(); for (const [k,v] of Object.entries(delta)) s[k] = Number(s[k]||0)+Number(v||0); await set({[KEYS.stats]:s}); return s; }
async function appendLog(type, message, url='') {
  const d = await get({[KEYS.logs]:[]});
  const list = [{at:now(),type,message,url}, ...(d[KEYS.logs]||[])].filter(x => now()-Number(x.at||0) <= LOG_AGE).slice(0,MAX_LOGS);
  await set({[KEYS.logs]:list});
}
async function getLogs() { const d = await get({[KEYS.logs]:[]}); return (d[KEYS.logs]||[]).filter(x => now()-Number(x.at||0) <= LOG_AGE).slice(0,MAX_LOGS); }

function ruleMatch(url, rule) { return U.ruleMatches(url, rule); }
function ruleForUrl(url, rules) { return rules.find(r => ruleMatch(url, r)); }
function validDomain(v) { return U.normalizeDomain(v); }

async function migrate() {
  const d = await get({[KEYS.rules]:null,[KEYS.legacy]:[]});
  if (d[KEYS.rules] !== null) return;
  const legacy = Array.isArray(d[KEYS.legacy]) ? d[KEYS.legacy] : [];
  const rules = legacy.map(e => ({id:id(), type:'url', value:safeUrl(e.url), createdAt:Number(e.protectedAt)||now()})).filter(r=>r.value);
  await setRules(rules);
  if (rules.length) await appendLog('migration', `Đã chuyển ${rules.length} quy tắc từ bản cũ`);
}

async function addRule(rule) {
  const n = U.normalizeRule(rule); if (!n.value) throw new Error('Quy tắc không hợp lệ.');
  const rules = await getRules();
  if (rules.some(r => r.type===n.type && U.normalizeRule(r).value===n.value)) return rules;
  const next = [{...n,id:id(),createdAt:now()}, ...rules].slice(0,MAX_RULES);
  await setRules(next); await bump(n.type==='domain'?{domainRules:1}:{urlRules:1});
  await appendLog('protect', `Đã bảo vệ ${n.type==='domain'?'domain':'URL'}`, n.value);
  return next;
}
async function removeRule(idValue) {
  const rules = await getRules(); const removed = rules.find(r=>r.id===idValue); const next=rules.filter(r=>r.id!==idValue);
  await setRules(next); if (removed) { await bump({unblocked:1}); await appendLog('unprotect','Đã bỏ bảo vệ',removed.value); }
  return {rules:next,removed:Boolean(removed)};
}
async function removeRuleBy(type,value) {
  const target=U.normalizeRule({type,value}); const rules=await getRules(); const removed=rules.filter(r=>r.type===target.type && U.normalizeRule(r).value===target.value); const next=rules.filter(r=>!removed.includes(r));
  await setRules(next); if (removed.length) await bump({unblocked:removed.length});
  for (const r of removed) await appendLog('unprotect','Đã bỏ bảo vệ',r.value);
  return {rules:next,count:removed.length};
}
async function clearRules() { const rules=await getRules(); await setRules([]); await bump({unblocked:rules.length}); await appendLog('unprotect-all','Đã bỏ bảo vệ tất cả'); return rules.length; }

async function deleteUrl(url, auto=false) {
  if (!http(url)) return false;
  try { await chrome.history.deleteUrl({url}); } catch (_) {}
  await bump(auto ? {deleted:1,autoDeleted:1} : {deleted:1});
  return true;
}
async function currentUrl(tab) { return http(tab?.url) ? safeUrl(tab.url) : ''; }
async function protectAndDelete(url, tabId) {
  const n=safeUrl(url); if(!n) throw new Error('URL hiện tại không hợp lệ.');
  await deleteUrl(n); await addRule({type:'url',value:n});
  if (Number.isInteger(tabId)) { try{ await chrome.tabs.remove(tabId); }catch(_){} }
}

async function requirePinForSensitive(message={}) {
  if (!(await requirePin(message))) throw new Error('Cần PIN để thực hiện thao tác này.');
}

async function findRecentSession(sessionId) {
  if (!chrome.sessions?.getRecentlyClosed || !sessionId) return null;
  const items = await chrome.sessions.getRecentlyClosed({maxResults: 20});
  return (items || []).find(x => x.sessionId === sessionId) || null;
}

async function wipeAll() {
  const s=await getSettings();
  const data = {...s.wipeData, history:true};
  try { if (chrome.browsingData?.remove) await chrome.browsingData.remove({since:0,originTypes:{unprotectedWeb:true}}, data); else await chrome.history.deleteAll(); } catch (_) { try{await chrome.history.deleteAll();}catch(e){} }
  await bump({wipes:1}); await appendLog('wipe','Đã thực hiện Wipe Now');
}
async function wipeOrigin(url) {
  if (!http(url)) return false;
  let origin; try { origin = new URL(url).origin; } catch { return false; }
  let ok = true;
  if (chrome.browsingData?.remove) {
    const data = {cache:true, cookies:true, localStorage:true, indexedDB:true, serviceWorkers:true};
    try { await chrome.browsingData.remove({origins:[origin]}, data); } catch { ok = false; }
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    const items = await new Promise(resolve => chrome.history.search({text: host, startTime: 0, maxResults: 5000}, resolve));
    const matches = (items || []).filter(x => { try { return new URL(x.url).hostname.toLowerCase() === host; } catch { return false; } });
    await Promise.all(matches.map(x => chrome.history.deleteUrl({url:x.url}).catch(()=>{})));
  } catch { ok = false; }
  if (ok) { await bump({wipes:1}); await appendLog('site-wipe','Đã dọn dữ liệu website',origin); }
  return ok;
}

async function sweep() {
  const s=await getSettings(); if(!s.autoDelete && !s.deleteOldDays) return;
  if (s.deleteOldDays>0 && chrome.browsingData?.removeHistory) {
    await chrome.browsingData.removeHistory({since: now()-s.deleteOldDays*24*60*60*1000});
    await appendLog('cleanup',`Đã xóa lịch sử cũ hơn ${s.deleteOldDays} ngày`);
  } else if (s.autoDelete) {
    try { await chrome.history.deleteAll(); } catch(_) {}
    await appendLog('auto-delete',`Đã dọn lịch sử theo chu kỳ ${s.intervalMinutes} phút`);
  }
}
async function syncAlarms() {
  const s=await getSettings();
  await chrome.alarms.clear(ALARMS.sweep); await chrome.alarms.clear(ALARMS.schedule);
  if (s.autoDelete || s.deleteOldDays>0) await chrome.alarms.create(ALARMS.sweep,{periodInMinutes:s.intervalMinutes});
  if (s.dailyCleanupTime) {
    const [hh,mm]=String(s.dailyCleanupTime).split(':').map(Number); const d=new Date(); d.setHours(hh||0,mm||0,0,0); if(d.getTime()<=now()) d.setDate(d.getDate()+1);
    await chrome.alarms.create(ALARMS.schedule,{when:d.getTime()});
  }
}
async function setAuto(enabled, interval) { const s=await setSettings({...await getSettings(),autoDelete:enabled,intervalMinutes:Number(interval)||1}); await syncAlarms(); if(enabled){await wipeAll();await appendLog('auto-start','Đã bật tự động xóa');} else await appendLog('auto-stop','Đã dừng tự động xóa'); return s; }

async function autoVisit(item) {
  if (!http(item?.url)) return;
  const s=await getSettings(); const rules=await getRules(); const smart=await getSmartRules();
  if (s.historyOnVisit && s.autoDelete && !ruleForUrl(item.url, [])) await deleteUrl(item.url,true);
  const protectedRule=ruleForUrl(item.url,rules); if(protectedRule) await deleteUrl(item.url,true);
  for (const r of smart) {
    const hit = r.matchType==='domain' ? U.domainFromUrl(item.url)===U.normalizeDomain(r.pattern) || U.domainFromUrl(item.url).endsWith(`.${U.normalizeDomain(r.pattern)}`) : String(item.url).toLowerCase().includes(String(r.pattern||'').toLowerCase());
    if (!hit) continue;
    if (r.actions?.deleteHistory) await deleteUrl(item.url,true);
    if (r.actions?.protect) await addRule({type:r.matchType==='domain'?'domain':'url',value:r.matchType==='domain'?r.pattern:item.url});
    if (r.actions?.siteWipe) await wipeOrigin(item.url);
  }
}

async function enforceTab(tab) {
  const urls=[tab?.pendingUrl,tab?.url].filter(http); if(!urls.length) return false;
  const rules=await getRules(); const matched=urls.find(u=>ruleForUrl(u,rules)); if(!matched) return false;
  await deleteUrl(matched); await bump({blockedRestores:1}); await appendLog('blocked-restore','Đã chặn website được khôi phục',matched);
  try{await chrome.tabs.remove(tab.id);}catch(_){} return true;
}
async function scanTabs(){const tabs=await queryTabs({}); await Promise.all(tabs.map(enforceTab));}

function detectedBrowser(){ const ua=(typeof navigator!=='undefined'?navigator.userAgent:''); return /coccoc/i.test(ua)?'Cốc Cốc':/chrome/i.test(ua)?'Chrome':'Chromium'; }
async function setBadge() { const s=await getSettings(); chrome.action.setBadgeText({text:s.autoDelete?'ON':''}); chrome.action.setBadgeBackgroundColor({color:s.autoDelete?'#22c55e':'#334155'}); }
function pinLocked(){ return unlockedUntil<=now(); }
async function requirePin(message) { const s=await getSettings(); if(!s.pinEnabled) return true; if(message?.pin && await U.isPinValid(String(message.pin),s.pinHash)){unlockedUntil=now()+5*60*1000;return true;} return !pinLocked(); }

chrome.runtime.onInstalled.addListener(async()=>{await migrate(); await syncAlarms(); await setBadge(); if(chrome.contextMenus){chrome.contextMenus.removeAll(()=>{chrome.contextMenus.create({id:'hgp-protect-url',title:'History Guard: Bảo vệ URL này',contexts:['page']});chrome.contextMenus.create({id:'hgp-protect-domain',title:'History Guard: Bảo vệ domain này',contexts:['page']});chrome.contextMenus.create({id:'hgp-wipe-site',title:'History Guard: Wipe website',contexts:['page']});chrome.contextMenus.create({id:'hgp-wipe-all',title:'History Guard: Wipe Now',contexts:['page']});});}});
chrome.runtime.onStartup.addListener(async()=>{await migrate(); const s=await getSettings(); if(s.deleteOnStartup) await wipeAll(); await syncAlarms(); await setBadge(); await scanTabs();});
chrome.alarms.onAlarm.addListener(async alarm=>{if(alarm.name===ALARMS.sweep){await sweep();await scanTabs();} if(alarm.name===ALARMS.schedule){await sweep(); const s=await getSettings(); if(s.dailyCleanupTime){const [hh,mm]=s.dailyCleanupTime.split(':').map(Number);const d=new Date();d.setDate(d.getDate()+1);d.setHours(hh||0,mm||0,0,0);await chrome.alarms.create(ALARMS.schedule,{when:d.getTime()});}}});
chrome.history.onVisited.addListener(autoVisit);
chrome.tabs.onCreated.addListener(enforceTab); chrome.tabs.onUpdated.addListener((_id,change,tab)=>{if(change.url||change.status==='complete'||change.pendingUrl) enforceTab(tab);}); chrome.webNavigation?.onCommitted?.addListener(details=>{if(details.frameId===0) chrome.tabs.get(details.tabId).then(enforceTab).catch(()=>{});}); chrome.tabs.onActivated.addListener(async({tabId})=>{try{await enforceTab(await chrome.tabs.get(tabId));}catch(_){}}); chrome.tabs.onReplaced.addListener(async(_added,_removed)=>scanTabs()); chrome.sessions?.onChanged?.addListener(scanTabs);
chrome.commands?.onCommand?.addListener(async(cmd)=>{if(cmd==='wipe-now' && await requirePin({})) await wipeAll();});
chrome.contextMenus?.onClicked?.addListener(async(info,tab)=>{try{
  if(info.menuItemId==='hgp-wipe-all'){await requirePinForSensitive({}); await wipeAll(); return;}
  if(!tab?.url) return;
  if(info.menuItemId==='hgp-protect-url'){await requirePinForSensitive({}); await protectAndDelete(tab.url,tab.id); return;}
  if(info.menuItemId==='hgp-protect-domain'){await requirePinForSensitive({}); await addRule({type:'domain',value:new URL(tab.url).hostname}); return;}
  if(info.menuItemId==='hgp-wipe-site'){await requirePinForSensitive({}); await wipeOrigin(tab.url);}
}catch(e){await appendLog('error',e?.message||'Context menu action failed');}});

chrome.runtime.onMessage.addListener((m,sender,send)=>{(async()=>{try{
  if(m.type==='dashboard'){const [rules,smart,settings,stats,logs]=await Promise.all([getRules(),getSmartRules(),getSettings(),getStats(),getLogs()]);const tabs=await queryTabs({});return {ok:true,rules,smart,settings,stats,logs,browser:detectedBrowser(),tabCount:tabs.length,locked:settings.pinEnabled&&pinLocked()};}
  if(['delete-current','protect-current','clean-current'].includes(m.type)){if(m.type!=='delete-current') await requirePinForSensitive(m); const url=await currentUrl(sender.tab); if(!url) throw new Error('Không có URL http/https.'); if(m.type!=='delete-current') await addRule({type:'url',value:url}); await deleteUrl(url); if(m.type!=='delete-current'||m.close) try{await chrome.tabs.remove(sender.tab.id);}catch(_){} return {ok:true};}
  if(m.type==='wipe-now'){if(!(await requirePin(m))) throw new Error('Cần PIN để thực hiện thao tác này.'); await wipeAll(); return {ok:true};}
  if(m.type==='wipe-site'){if(!(await requirePin(m))) throw new Error('Cần PIN để thực hiện thao tác này.'); return {ok:await wipeOrigin(m.url||sender.tab?.url)};}
  if(m.type==='set-auto'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.'); return {ok:true,settings:await setAuto(m.enabled,m.intervalMinutes)};}
  if(m.type==='set-settings'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.'); const cur=await getSettings(); const next=await setSettings({...cur,...m.settings}); await syncAlarms(); await setBadge(); return {ok:true,settings:next};}
  if(m.type==='protect-url'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.'); await addRule({type:'url',value:m.url});return {ok:true,rules:await getRules()};}
  if(m.type==='protect-domain'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.'); await addRule({type:'domain',value:m.domain});return {ok:true,rules:await getRules()};}
  if(m.type==='unprotect-id'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.'); return {ok:true,...await removeRule(m.id)};}
  if(m.type==='unprotect'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.'); return {ok:true,...await removeRuleBy(m.typeRule||'url',m.value)};}
  if(m.type==='unprotect-all'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.'); return {ok:true,count:await clearRules()};}
  if(m.type==='add-smart'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.');const rules=await getSmartRules();const r={id:id(),pattern:String(m.pattern||'').trim(),matchType:m.matchType==='domain'?'domain':'contains',actions:{deleteHistory:m.actions?.deleteHistory!==false,protect:m.actions?.protect===true,siteWipe:m.actions?.siteWipe===true},createdAt:now()};if(!r.pattern)throw new Error('Thiếu mẫu quy tắc.');await setSmartRules([r,...rules]);return {ok:true,smart:await getSmartRules()};}
  if(m.type==='remove-smart'){if(!(await requirePin(m))) throw new Error('Cần PIN để thay đổi.');const rules=await getSmartRules();await setSmartRules(rules.filter(r=>r.id!==m.id));return {ok:true,smart:await getSmartRules()};}
  if(m.type==='recent-sessions'){const list=chrome.sessions?.getRecentlyClosed?await chrome.sessions.getRecentlyClosed({maxResults:20}):[];return {ok:true,sessions:list};}
  if(m.type==='restore-session'){if(!(await requirePin(m))) throw new Error('Cần PIN để khôi phục.');const rules=await getRules();const target=await findRecentSession(m.session?.sessionId);if(!target) throw new Error('Session không còn khả dụng.');const urls=[];if(target?.tab?.url)urls.push(target.tab.url);if(Array.isArray(target?.window?.tabs))urls.push(...target.window.tabs.map(t=>t.url).filter(Boolean));if(urls.some(u=>ruleForUrl(u,rules)))throw new Error('Session này chứa trang đang được bảo vệ. Bỏ bảo vệ trước khi khôi phục.');const result=chrome.sessions?.restore?await chrome.sessions.restore(target.sessionId):null;return {ok:Boolean(result)};}
  if(m.type==='export'){const p=U.createExportPayload(await getRules(),await getSettings(),await getStats(),now());p.smartRules=await getSmartRules();return {ok:true,payload:p};}
  if(m.type==='import'){if(!(await requirePin(m))) throw new Error('Cần PIN để nhập backup.');const p=m.payload;const merged=U.applyImportPayload(p,await getRules());await setRules(merged.rules);if(Array.isArray(p.smartRules))await setSmartRules(p.smartRules.slice(0,MAX_SMART));await setSettings({...await getSettings(),...merged.settings});await syncAlarms();await setBadge();await appendLog('import','Đã nhập bản sao lưu');return {ok:true};}
  if(m.type==='pin-set'){const pin=String(m.pin||'');if(!/^\d{4,8}$/.test(pin))throw new Error('PIN phải gồm 4–8 chữ số.');const hash=await U.hashPin(pin);const s=await setSettings({...await getSettings(),pinHash:hash,pinEnabled:true});unlockedUntil=now()+5*60*1000;return {ok:true,settings:s};}
  if(m.type==='pin-disable'){const cur=await getSettings();if(cur.pinEnabled){if(!(await requirePin(m))) throw new Error('Cần PIN để tắt PIN Lock.');}const s=await setSettings({...cur,pinHash:'',pinEnabled:false});unlockedUntil=now()+5*60*1000;return {ok:true,settings:s};}
  if(m.type==='pin-unlock'){const s=await getSettings();if(!s.pinEnabled) return {ok:true};if(await U.isPinValid(String(m.pin||''),s.pinHash)){unlockedUntil=now()+5*60*1000;return {ok:true};}throw new Error('PIN không đúng.');}
  if(m.type==='reset-stats'){await set({[KEYS.stats]:STATS_DEFAULT});return {ok:true};}
  if(m.type==='clear-logs'){await set({[KEYS.logs]:[]});return {ok:true};}
  if(m.type==='open-sidepanel'){if(chrome.sidePanel?.open){await chrome.sidePanel.open({windowId:sender.tab?.windowId || (await chrome.windows.getCurrent()).id});return {ok:true};}return {ok:false};}
  return {ok:false,error:'Lệnh không được hỗ trợ.'};
}catch(e){return {ok:false,error:e?.message||'Đã xảy ra lỗi.'};}})().then(send); return true;});
