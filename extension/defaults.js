// Shared cleaning options for popup and context menu (same defaults as the website tool).
var CTF_DEFAULTS = { markdown: true, invisible: true, citations: true, quotes: false, tidy: true, keepLinks: false, tracking: false, emoji: false, emDash: 'comma', bullets: 'dot' };
// Keys the popup lets the user change; the context menu reads the same ones from chrome.storage.local.
var CTF_USER_KEYS = ['emDash', 'keepLinks', 'quotes', 'tracking', 'emoji'];
