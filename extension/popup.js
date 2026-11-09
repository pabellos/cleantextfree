// Popup UI: same engine as www.cleantextfree.com/ai-text-cleaner (lib/ai-cleaner.js, copied at build).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var mode = 'ai';
  var input = $('input'), output = $('output'), report = $('report');

  function userOpts() {
    return { emDash: $('emDash').value, keepLinks: $('keepLinks').checked, quotes: $('quotes').checked, tracking: $('tracking').checked, emoji: $('emoji').checked };
  }
  function opts() {
    return Object.assign({}, CTF_DEFAULTS, userOpts());
  }
  function run() {
    var src = input.value;
    if (!src) { output.value = ''; report.textContent = ''; return; }
    if (mode === 'hidden') {
      var scan = window.CTFClean.scanInvisible(src);
      output.value = window.CTFClean.fixInvisible(src);
      report.textContent = scan.total ? scan.total + ' hidden character' + (scan.total === 1 ? '' : 's') + ' removed' : 'No hidden characters found';
    } else {
      var r = window.CTFClean.cleanAiText(src, opts());
      output.value = r.text;
      var s = r.stats, parts = [];
      if (s.markdown) parts.push(s.markdown + ' Markdown');
      if (s.emDash) parts.push(s.emDash + ' em dash');
      if (s.invisible) parts.push(s.invisible + ' hidden');
      if (s.citations) parts.push(s.citations + ' citation');
      if (s.tracking) parts.push(s.tracking + ' tracking tag');
      if (s.quotes) parts.push(s.quotes + ' quote');
      if (s.emoji) parts.push(s.emoji + ' emoji');
      report.textContent = parts.length ? 'Removed: ' + parts.join(' · ') : 'Nothing to clean';
    }
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.getAttribute('data-mode');
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t === b); });
      $('aiOpts').style.display = mode === 'ai' ? '' : 'none';
      run();
    });
  });
  input.addEventListener('input', run);
  CTF_USER_KEYS.forEach(function (id) {
    $(id).addEventListener('change', function () {
      chrome.storage.local.set(userOpts());
      run();
    });
  });
  $('copy').addEventListener('click', function () {
    if (!output.value) return;
    navigator.clipboard.writeText(output.value).then(function () {
      $('copy').textContent = 'Copied';
      setTimeout(function () { $('copy').textContent = 'Copy'; }, 1500);
    });
  });
  chrome.storage.local.get(CTF_USER_KEYS, function (s) {
    if (s.emDash) $('emDash').value = s.emDash;
    ['keepLinks', 'quotes', 'tracking', 'emoji'].forEach(function (k) { if (typeof s[k] === 'boolean') $(k).checked = s[k]; });
  });
})();
