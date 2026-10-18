import { SITES_KEY, syncContentScripts } from './lib/sites.js';

chrome.runtime.onInstalled.addListener(syncContentScripts);
chrome.runtime.onStartup.addListener(syncContentScripts);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && SITES_KEY in changes) syncContentScripts();
});

// 許可の付与はポップアップが閉じた後に確定することがあるので、ここでも同期する
chrome.permissions.onAdded.addListener(syncContentScripts);
chrome.permissions.onRemoved.addListener(syncContentScripts);
