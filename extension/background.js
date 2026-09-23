// Context menu: clean the current selection and copy the result. Nothing is sent over the network.
importScripts('defaults.js');

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({ id: 'ctf-clean', title: 'Clean AI text & copy', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'ctf-hidden', title: 'Remove hidden characters & copy', contexts: ['selection'] });
});

chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  if (!tab || !tab.id) return;
  const stored = await chrome.storage.local.get(['emDash', 'keepLinks']);
  const opts = Object.assign({}, CTF_DEFAULTS, stored);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: false }, files: ['lib/ai-cleaner.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: false }, func: cleanSelectionInPage, args: [info.menuItemId, opts, info.selectionText || ''] });
  } catch (e) {
    // Restricted pages (chrome://, Web Store) block scripting; nothing to clean there.
    console.warn('CleanTextFree:', e && e.message);
  }
});

// Runs in the page's isolated world. window.getSelection() keeps line breaks (info.selectionText does not).
function cleanSelectionInPage(menuId, opts, fallback) {
  var src = (window.getSelection && window.getSelection().toString()) || fallback;
  var api = window.CTFClean;
  if (!api || !src) return;
  var out = menuId === 'ctf-hidden' ? api.fixInvisible(src) : api.cleanAiText(src, opts).text;
  function toast(msg) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;z-index:2147483647;bottom:24px;right:24px;background:#1e293b;color:#fff;padding:10px 14px;border-radius:8px;font:14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2)';
    document.documentElement.appendChild(d);
    setTimeout(function () { d.remove(); }, 2200);
  }
  function fallbackCopy() {
    var ta = document.createElement('textarea');
    ta.value = out; ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.documentElement.appendChild(ta); ta.select();
    var ok = document.execCommand('copy'); ta.remove();
    toast(ok ? 'Cleaned text copied' : 'Could not copy — try the toolbar button');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out).then(function () { toast('Cleaned text copied'); }, fallbackCopy);
  } else fallbackCopy();
}
