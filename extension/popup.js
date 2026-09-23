// Popup UI: same engine as www.cleantextfree.com/ai-text-cleaner (lib/ai-cleaner.js, copied at build).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var mode = 'ai';
  var input = $('input'), output = $('output'), report = $('report');

  function opts() {
    return Object.assign({}, CTF_DEFAULTS, { emDash: $('emDash').value, keepLinks: $('keepLinks').checked });
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
  ['emDash', 'keepLinks'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      chrome.storage.local.set({ emDash: $('emDash').value, keepLinks: $('keepLinks').checked });
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
  chrome.storage.local.get(['emDash', 'keepLinks'], function (s) {
    if (s.emDash) $('emDash').value = s.emDash;
    if (typeof s.keepLinks === 'boolean') $('keepLinks').checked = s.keepLinks;
  });
})();
