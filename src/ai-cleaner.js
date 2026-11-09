/* CleanTextFree — AI Text Cleaner engine + UI (shared by /ai-text-cleaner and /html-viewer).
   Everything runs client-side; no text leaves the browser. */
(function () {
  'use strict';

  // ---------- Invisible / special character catalogue ----------
  var INVISIBLE = {
    0x200B: ['ZWSP', 'Zero-width space', 'remove'],
    0x200C: ['ZWNJ', 'Zero-width non-joiner', 'remove'],
    0x200D: ['ZWJ', 'Zero-width joiner', 'remove'],
    0x2060: ['WJ', 'Word joiner', 'remove'],
    0xFEFF: ['BOM', 'Byte-order mark / zero-width no-break space', 'remove'],
    0x180E: ['MVS', 'Mongolian vowel separator', 'remove'],
    0x00AD: ['SHY', 'Soft hyphen', 'remove'],
    0x200E: ['LRM', 'Left-to-right mark', 'remove'],
    0x200F: ['RLM', 'Right-to-left mark', 'remove'],
    0x061C: ['ALM', 'Arabic letter mark', 'remove'],
    0x00A0: ['NBSP', 'No-break space', 'space'],
    0x202F: ['NNBSP', 'Narrow no-break space', 'space'],
    0x2007: ['FSP', 'Figure space', 'space'],
    0x2008: ['PSP', 'Punctuation space', 'space'],
    0x2009: ['THSP', 'Thin space', 'space'],
    0x200A: ['HSP', 'Hair space', 'space'],
    0x205F: ['MMSP', 'Medium mathematical space', 'space'],
    0x3000: ['IDSP', 'Ideographic space', 'space'],
    0x1680: ['OSP', 'Ogham space mark', 'space'],
    0x2028: ['LSEP', 'Line separator', 'newline'],
    0x2029: ['PSEP', 'Paragraph separator', 'newline'],
    // Rest of Default_Ignorable_Code_Point (UCD 18.0) that can hide in copied text. Variation selectors (FE00–FE0F,
    // E0100–E01EF) are deliberately NOT here: they shape emoji and CJK glyphs.
    0x034F: ['CGJ', 'Combining grapheme joiner', 'remove'],
    0x115F: ['HF', 'Hangul choseong filler', 'remove'],
    0x1160: ['HF', 'Hangul jungseong filler', 'remove'],
    0x17B4: ['KIV', 'Khmer inherent vowel (invisible)', 'remove'],
    0x17B5: ['KIV', 'Khmer inherent vowel (invisible)', 'remove'],
    0x180F: ['FVS', 'Mongolian free variation selector', 'remove'],
    0x2061: ['MATH', 'Function application (invisible)', 'remove'],
    0x2062: ['MATH', 'Invisible times', 'remove'],
    0x2063: ['MATH', 'Invisible separator', 'remove'],
    0x2064: ['MATH', 'Invisible plus', 'remove'],
    0x2065: ['RES', 'Reserved ignorable (U+2065)', 'remove'],
    0x3164: ['HF', 'Hangul filler', 'remove'],
    0xFFA0: ['HF', 'Halfwidth Hangul filler', 'remove']
  };
  for (var cp = 0x2000; cp <= 0x2006; cp++) INVISIBLE[cp] = ['SP', 'Typographic space (U+' + hex(cp) + ')', 'space'];
  for (cp = 0x202A; cp <= 0x202E; cp++) INVISIBLE[cp] = ['BIDI', 'Bidirectional control (U+' + hex(cp) + ')', 'remove'];
  for (cp = 0x2066; cp <= 0x2069; cp++) INVISIBLE[cp] = ['BIDI', 'Bidirectional isolate (U+' + hex(cp) + ')', 'remove'];
  for (cp = 0x206A; cp <= 0x206F; cp++) INVISIBLE[cp] = ['FMT', 'Deprecated format control (U+' + hex(cp) + ')', 'remove'];
  for (cp = 0x180B; cp <= 0x180D; cp++) INVISIBLE[cp] = ['FVS', 'Mongolian free variation selector', 'remove'];
  for (cp = 0xFFF0; cp <= 0xFFF8; cp++) INVISIBLE[cp] = ['RES', 'Reserved ignorable (U+' + hex(cp) + ')', 'remove'];
  for (cp = 0x1BCA0; cp <= 0x1BCA3; cp++) INVISIBLE[cp] = ['SHF', 'Shorthand format control (U+' + hex(cp) + ')', 'remove'];
  for (cp = 0x1D173; cp <= 0x1D17A; cp++) INVISIBLE[cp] = ['MUS', 'Musical format control (U+' + hex(cp) + ')', 'remove'];

  function hex(n) { return n.toString(16).toUpperCase().padStart(4, '0'); }

  function classify(code) {
    if (INVISIBLE[code]) return INVISIBLE[code];
    if (code >= 0xE0000 && code <= 0xE007F) return ['TAG', 'Unicode tag character (hidden text)', 'remove'];
    if (code >= 0xE0080 && code <= 0xE0FFF && !(code >= 0xE0100 && code <= 0xE01EF)) return ['RES', 'Reserved ignorable (U+' + hex(code) + ')', 'remove'];
    if (code >= 0xE000 && code <= 0xF8FF) return ['PUA', 'Private-use character', 'remove'];
    if ((code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) || (code >= 0x7F && code <= 0x9F)) {
      return ['CTRL', 'Control character (U+' + hex(code) + ')', 'remove'];
    }
    return null;
  }

  var EMOJI = /\p{Extended_Pictographic}/u;
  var SKIN = /\p{Emoji_Modifier}/u;

  // Tag characters are legal inside a flag tag sequence: U+1F3F4 + tags + U+E007F (England, Scotland, Wales; UTS #51).
  function isTagChar(ch) { var c = ch && ch.codePointAt(0); return c >= 0xE0020 && c <= 0xE007F; }
  function isFlagTag(chars, i) {
    if (!isTagChar(chars[i])) return false;
    var j = i; while (j > 0 && isTagChar(chars[j - 1])) j--;
    if (chars[j - 1] !== '\u{1F3F4}') return false;
    var k = i; while (k < chars.length && isTagChar(chars[k])) k++;
    return chars[k - 1] === '\u{E007F}';
  }
  function keepAsIs(chars, i) { return isEmojiJoiner(chars, i) || isFlagTag(chars, i); }

  // Scan text for invisible characters. Returns {counts:{name:n}, total}.
  function scanInvisible(text) {
    var counts = {}, total = 0, chars = Array.from(text);
    for (var i = 0; i < chars.length; i++) {
      var c = classify(chars[i].codePointAt(0));
      if (!c) continue;
      if (keepAsIs(chars, i)) continue;
      counts[c[1]] = (counts[c[1]] || 0) + 1;
      total++;
    }
    return { counts: counts, total: total };
  }

  // Keep ZWJ / variation-selector sequences inside emoji (e.g. family emoji).
  function isEmojiJoiner(chars, i) {
    if (chars[i] !== '‍') return false;
    // Step back over a variation selector and a skin-tone modifier (e.g. woman + medium skin + ZWJ + laptop).
    var j = i - 1;
    while (j > 0 && (chars[j] === '️' || SKIN.test(chars[j]))) j--;
    var prev = chars[j];
    return !!prev && EMOJI.test(prev) && !!chars[i + 1] && EMOJI.test(chars[i + 1]);
  }

  function fixInvisible(text) {
    var out = '', chars = Array.from(text);
    for (var i = 0; i < chars.length; i++) {
      var c = classify(chars[i].codePointAt(0));
      if (!c || keepAsIs(chars, i)) { out += chars[i]; continue; }
      if (c[2] === 'space') out += ' ';
      else if (c[2] === 'newline') out += '\n';
    }
    return out;
  }

  // ---------- Markdown → plain text ----------
  function stripMarkdown(text, o, stats) {
    var lines = text.split('\n'), out = [];
    // GFM delimiter row: cells of one or more hyphens with optional alignment colons (|:--|--:|, |:-:|).
    var tableSep = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], before = l;
      if (/^\s*(```|~~~)/.test(l)) { stats.markdown++; continue; }
      if (tableSep.test(l) && l.indexOf('|') !== -1) { stats.markdown++; continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { stats.markdown++; continue; }
      // Setext underline (===== under a non-empty line); the --- variant is already caught as a thematic break.
      if (/^\s{0,3}=+\s*$/.test(l) && out.length && out[out.length - 1].trim()) { stats.markdown++; continue; }
      l = l.replace(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/, '$1');
      l = l.replace(/^(\s*)(?:>\s?)+/, '$1');
      if (/^\s*\|.*\|\s*$/.test(l)) {
        l = l.trim().replace(/^\||\|$/g, '').split('|').map(function (s) { return s.trim(); }).join('\t');
      }
      if (o.bullets !== 'keep') {
        l = l.replace(/^(\s*)[-*+]\s+(\[[ xX]\]\s+)?/, function (m, ind) { return ind + (o.bullets === 'dot' ? '• ' : '- '); });
      }
      l = inlineMarkdown(l, o);
      if (l !== before) stats.markdown++;
      out.push(l);
    }
    return out.join('\n');
  }

  function inlineMarkdown(l, o) {
    // Inline code is parked first so emphasis rules can't touch **kwargs or __init__.
    var codes = [];
    l = l.replace(/`([^`\n]+)`/g, function (m, c) { codes.push(c); return '\u0003' + (codes.length - 1) + '\u0003'; });
    l = l.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    l = l.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (m, t, u) { return o.keepLinks ? t + ' (' + u + ')' : t; });
    l = l.replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2');
    l = l.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1$2');
    l = l.replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2');
    l = l.replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1');
    l = l.replace(/\*\*/g, '');
    return l.replace(/\u0003(\d+)\u0003/g, function (m, i) { return codes[i]; });
  }

  // ---------- Citations and tracking parameters ----------
  // Perplexity-style [3][14], [1, 2], [1-3] after a sentence. Lines that start with [n] are a source list and stay;
  // inline code is skipped. Cost: "arr[1] is" in plain prose loses [1] (the toggle turns this off).
  var NUM_CITE = /[ \t]?(?:\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\])+(?=[\s.,;:!?]|$)/g;
  // A numbered link is a citation, not a link: [1](https://…) (Claude, ChatGPT) and [[1]](https://…) (Grok API).
  var LINK_CITE = /[ \t]?\[\[?\d{1,3}\]?\]\((?:https?:)?\/\/[^)\s]+\)(?=[\s.,;:!?)]|$)/g;
  function stripNumericCitations(text, stats) {
    return text.split('\n').map(function (line) {
      if (/^\s*\[\d{1,3}\]/.test(line)) return line;
      return line.split(/(`[^`\n]+`)/).map(function (part, i) {
        if (i % 2) return part;
        part = part.replace(LINK_CITE, function () { stats.citations++; return ''; });
        return part.replace(NUM_CITE, function () { stats.citations++; return ''; });
      }).join('');
    }).join('\n');
  }

  // ---------- Emoji (optional) ----------
  // One emoji = pictograph / regional indicator pair / keycap base, plus any joiners, modifiers, selectors and tags.
  // © ® ™ and friends are Extended_Pictographic too, so they are kept unless written as emoji (with U+FE0F).
  var EMOJI_SEQ = /[ \t]?(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[#*0-9]️?⃣)(?:[️⃣‍]|\p{Emoji_Modifier}|\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{E0020}-\u{E007F}])*/gu;
  var TEXT_DEFAULT = /^[ \t]?[©®™‼⁉ℹ↔-↙↩↪⌨⏏Ⓜ▪▫▶◀◻◼☀-☄☎☑☘☝☠☢☣☦☪☮☯☸-☺♀♂♟♠♣♥♦♨♻♾⚒⚔-⚗⚙⚛⚜⚠⚧⚰⚱⛈⛏⛑⛓⛩⛰⛱⛴⛷⛸✂✈✉✌✍✏✒✔✖✝✡✳✴❄❇❣❤➡⤴⤵⬅-⬇〰〽㊗㊙]$/u;
  function stripEmoji(text, stats) {
    return text.replace(EMOJI_SEQ, function (m) {
      if (TEXT_DEFAULT.test(m)) return m; // text-presentation symbol without U+FE0F: ©, ™, ↔ … stay
      stats.emoji++;
      return '';
    });
  }

  // utm_* pointing at an AI tool always go; with `all`, every utm_*, fbclid and gclid go too.
  var AI_UTM = /chatgpt|openai|perplexity|copilot|gemini|claude\.ai/i;
  function stripTracking(text, all, stats) {
    return text.replace(/https?:\/\/[^\s<>()"'\]]+/g, function (url) {
      var hash = url.indexOf('#'), frag = hash === -1 ? '' : url.slice(hash);
      var base = hash === -1 ? url : url.slice(0, hash), q = base.indexOf('?');
      if (q === -1) return url;
      var kept = base.slice(q + 1).split('&').filter(function (p) {
        var k = p.split('=')[0].toLowerCase(), v = decodeURIComponentSafe(p.slice(k.length + 1));
        var drop = /^utm_/.test(k) ? (all || AI_UTM.test(v)) : (all && (k === 'fbclid' || k === 'gclid'));
        if (drop) stats.tracking++;
        return p && !drop;
      });
      return base.slice(0, q) + (kept.length ? '?' + kept.join('&') : '') + frag;
    });
  }
  function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  // ---------- AI-text pipeline ----------
  function cleanAiText(text, o) {
    var stats = { markdown: 0, emDash: 0, quotes: 0, citations: 0, invisible: 0, tracking: 0, emoji: 0 };
    text = text.normalize('NFC');
    var inv = scanInvisible(text);
    if (o.invisible) { stats.invisible = inv.total; text = fixInvisible(text); }
    text = text.replace(/\r\n?/g, '\n');
    // Fenced code blocks pass through every step verbatim; with Markdown on, only the ``` lines go.
    var blocks = [];
    text = text.replace(/^[ \t]*(```|~~~)[^\n]*\n([\s\S]*?)\n?^[ \t]*\1[ \t]*$/gm, function (m, f, body) {
      if (o.markdown) stats.markdown += 2;
      blocks.push(o.markdown ? body : m);
      return '\u0004' + (blocks.length - 1) + '\u0004';
    });
    // Inline code is parked for the whole pipeline (citations, dashes, quotes must not touch it); the backticks
    // themselves go only with Markdown on.
    var codes = [];
    text = text.replace(/`([^`\n]+)`/g, function (m, c) {
      if (o.markdown) stats.markdown++;
      codes.push(o.markdown ? c : m);
      return '\u0005' + (codes.length - 1) + '\u0005';
    });
    // Backslash escapes (CommonMark 2.4): \* is a literal asterisk, so park it before the emphasis rules run.
    var escapes = [];
    if (o.markdown) {
      text = text.replace(/\\([!-\/:-@\[-`{-~])/g, function (m, c) { escapes.push(c); return '\u0006' + (escapes.length - 1) + '\u0006'; });
    }
    if (o.citations) {
      text = text.replace(/【[^】\n]{0,80}】/g, function () { stats.citations++; return ''; });
      text = text.replace(/\s?\bcite(?:turn\d+[a-z]+\d+)+/g, function () { stats.citations++; return ''; });
      // Gemini file-analysis leftovers: [cite_start] … [cite: 1, 2, 19]
      text = text.replace(/\[cite_start\][ \t]?/gi, function () { stats.citations++; return ''; });
      text = text.replace(/[ \t]?\[cite:\s*[\d,\s–-]+\]/gi, function () { stats.citations++; return ''; });
      text = stripNumericCitations(text, stats);
    }
    if (o.citations || o.tracking) text = stripTracking(text, o.tracking, stats);
    if (o.markdown) text = stripMarkdown(text, o, stats);
    if (o.emoji) text = stripEmoji(text, stats);
    // URLs are parked while dashes and quotes are rewritten (https://x.com/a—b must stay a working link).
    var urls = [];
    text = text.replace(/https?:\/\/[^\s<>()"'\]]+/g, function (u) { urls.push(u); return '\u0007' + (urls.length - 1) + '\u0007'; });
    if (o.emDash !== 'keep') {
      // Between digits an em dash is a range: 2010—2020 → 2010-2020, never a comma.
      text = text.replace(/(\d)\s*—\s*(?=\d)/g, function (m, d) { stats.emDash++; return d + '-'; });
      text = text.replace(/^([ \t]*)—\s*/gm, function (m, ind) { stats.emDash++; return ind; });
      text = text.replace(/\s*—\s*/g, function () { stats.emDash++; return o.emDash === 'comma' ? ', ' : ' - '; });
      if (o.emDash === 'comma') text = text.replace(/,\s*([,.;:!?])/g, '$1');
    }
    if (o.quotes) {
      text = text.replace(/[‘’‚‛]/g, function () { stats.quotes++; return "'"; });
      text = text.replace(/[“”„‟]/g, function () { stats.quotes++; return '"'; });
      text = text.replace(/…/g, function () { stats.quotes++; return '...'; });
    }
    if (o.tidy) {
      text = text.replace(/[ \t]+$/gm, '').replace(/([^\s]) {2,}/g, '$1 ').replace(/\n{3,}/g, '\n\n').trim();
    }
    text = text.replace(/\u0007(\d+)\u0007/g, function (m, i) { return urls[i]; });
    text = text.replace(/\u0006(\d+)\u0006/g, function (m, i) { return escapes[i]; });
    text = text.replace(/\u0005(\d+)\u0005/g, function (m, i) { return codes[i]; });
    text = text.replace(/\u0004(\d+)\u0004/g, function (m, i) { return blocks[i]; });
    return { text: text, stats: stats, invisible: inv };
  }

  // ---------- HTML → plain text ----------
  var BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TR|UL|DETAILS|SUMMARY)$/;

  function htmlToText(html, o) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,template,iframe,object,svg,head').forEach(function (n) { n.remove(); });
    // Breaks are collected as markers first, so adjacent blocks (li, tr) share one line break
    // and only paragraphs/headings produce a blank line.
    var LINE = '\u0001', PARA = '\u0002', out = [];
    walk(doc.body, false);
    return out.join('')
      .replace(/[ \t]*[\u0001\u0002][\s\u0001\u0002]*/g, function (run) { return run.indexOf(PARA) !== -1 ? '\n\n' : '\n'; })
      .trim();

    function walk(node, pre) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) { out.push(pre ? n.nodeValue : n.nodeValue.replace(/\s+/g, ' ')); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName;
        if (tag === 'BR') { out.push('\n'); return; }
        if (tag === 'IMG') { if (o.altText && n.alt) out.push('[' + n.alt + ']'); return; }
        var block = BLOCK.test(tag), brk = /^(H[1-6]|P|UL|OL|TABLE|PRE|BLOCKQUOTE)$/.test(tag) ? PARA : LINE;
        if (block) out.push(brk);
        if (tag === 'LI') out.push('• ');
        walk(n, pre || tag === 'PRE');
        if ((tag === 'TD' || tag === 'TH') && n.nextElementSibling) out.push('\t');
        if (tag === 'A' && o.links) {
          var href = n.getAttribute('href') || '';
          if (/^https?:|^mailto:/i.test(href) && href !== n.textContent.trim()) out.push(' (' + href + ')');
        }
        if (block) out.push(brk);
      });
    }
  }

  // Sandboxed preview document: no scripts (iframe sandbox), no network except optional images.
  function previewDoc(html, allowImages) {
    var csp = allowImages
      ? "default-src 'none'; style-src 'unsafe-inline' https:; img-src data: https: http:; font-src data: https:"
      : "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    // Also drop tags that can reach the network outside CSP's reach (DNS prefetch, refresh, base).
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('meta[http-equiv], base, link[rel~="dns-prefetch" i], link[rel~="preconnect" i], link[rel~="prefetch" i], link[rel~="preload" i], link[rel~="prerender" i], link[rel~="modulepreload" i]')
      .forEach(function (n) { n.remove(); });
    var meta = doc.createElement('meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', csp);
    doc.head.insertBefore(meta, doc.head.firstChild);
    return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  }

  // Visible rendering of hidden characters (for the detector view).
  function highlightInvisible(text) {
    var chars = Array.from(text), out = '';
    for (var i = 0; i < chars.length; i++) {
      var code = chars[i].codePointAt(0), c = classify(code);
      if (c && !keepAsIs(chars, i)) {
        out += '<mark class="inv" title="U+' + hex(code) + ' ' + escapeHtml(c[1]) + '">' + c[0] + '</mark>';
        if (code === 0x2028 || code === 0x2029) out += '\n';
      } else if (chars[i] === '—') {
        out += '<mark class="dash" title="U+2014 Em dash">—</mark>';
      } else {
        out += escapeHtml(chars[i]);
      }
    }
    return out;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // Expose the pure functions (used by tests and the console).
  window.CTFClean = { cleanAiText: cleanAiText, htmlToText: htmlToText, scanInvisible: scanInvisible, fixInvisible: fixInvisible, highlightInvisible: highlightInvisible };

  // ---------- UI ----------
  var SAMPLES = {
    ai: '## Quick Summary\n\nHere’s what you need to know — the project is **on track** and the budget is *under control*.\n\n### Key Points\n\n- **Timeline:** launch moves to March 12\n- **Budget:** 8% below plan — mostly thanks to vendor savings\n- Next step: review the [full report](https://example.com/report)​\n\n---\n\n> “Good progress overall.”\n\n| Metric | Value |\n|---|---|\n| Tasks done | 42 |\n| Open issues | 3 |',
    html: '<h1>Order confirmation</h1>\n<p>Thanks, <strong>Anna</strong>! Your order <a href="https://example.com/orders/1042">#1042</a> is on its way.</p>\n<ul>\n  <li>Wireless mouse &times; 1</li>\n  <li>USB-C cable &times; 2</li>\n</ul>\n<table border="1" cellpadding="6">\n  <tr><th>Subtotal</th><td>$34.00</td></tr>\n  <tr><th>Shipping</th><td>Free</td></tr>\n</table>\n<script>alert("scripts never run here")</script>'
  };

  function initUI() {
    var root = document.getElementById('aiCleaner');
    if (!root) return;
    var $ = function (id) { return document.getElementById(id); };
    var input = $('acInput'), output = $('acOutput'), hl = $('acHighlight'), frame = $('acPreview');
    var mode = root.getAttribute('data-default-mode') || 'ai', htmlView = 'preview', timer = null;

    function opts() {
      return {
        markdown: $('optMarkdown').checked, invisible: $('optInvisible').checked, citations: $('optCitations').checked,
        quotes: $('optQuotes').checked, tidy: $('optTidy').checked, keepLinks: $('optKeepLinks').checked,
        tracking: !!($('optTracking') && $('optTracking').checked),
        emoji: !!($('optEmoji') && $('optEmoji').checked),
        emDash: $('optEmDash').value, bullets: $('optBullets').value
      };
    }

    function setMode(m) {
      mode = m;
      root.querySelectorAll('[data-mode-tab]').forEach(function (b) {
        var on = b.getAttribute('data-mode-tab') === m;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      root.querySelectorAll('[data-show]').forEach(function (el) {
        el.style.display = el.getAttribute('data-show').split(' ').indexOf(m) !== -1 ? '' : 'none';
      });
      $('acInLabel').textContent = m === 'html' ? 'Paste HTML' : m === 'hidden' ? 'Paste text to inspect' : 'Paste AI text';
      input.placeholder = m === 'html' ? '<h1>Hello</h1><p>Paste any HTML…</p>' : 'Paste text from ChatGPT, Claude, Gemini or Copilot…';
      run();
    }

    function setHtmlView(v) {
      htmlView = v;
      root.querySelectorAll('[data-html-view]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-html-view') === v); });
      frame.style.display = v === 'preview' ? '' : 'none';
      output.style.display = v === 'text' ? '' : 'none';
    }

    function report(rows) {
      var box = $('acReport');
      var shown = rows.filter(function (r) { return r[1] > 0; });
      box.innerHTML = shown.length
        ? '<ul>' + shown.map(function (r) { return '<li><span>' + escapeHtml(r[0]) + '</span><b>' + r[1] + '</b></li>'; }).join('') + '</ul>'
        : '<p class="ac-empty">' + (input.value ? 'Nothing to clean — the text looks tidy.' : 'Paste text to see what gets cleaned.') + '</p>';
    }

    function run() {
      var v = input.value;
      if (mode === 'ai') {
        output.style.display = ''; hl.style.display = 'none'; frame.style.display = 'none';
        var r = cleanAiText(v, opts());
        output.value = r.text;
        report([['Markdown marks (lines)', r.stats.markdown], ['Hidden characters', r.stats.invisible], ['Em dashes', r.stats.emDash],
          ['Curly quotes / ellipses', r.stats.quotes], ['Citation markers', r.stats.citations], ['Tracking parameters', r.stats.tracking], ['Emoji', r.stats.emoji]]);
      } else if (mode === 'hidden') {
        output.style.display = 'none'; frame.style.display = 'none'; hl.style.display = '';
        hl.innerHTML = v ? highlightInvisible(v) : '<span class="ac-empty">Hidden characters will be highlighted here.</span>';
        var s = scanInvisible(v), dashes = (v.match(/—/g) || []).length;
        var rows = Object.keys(s.counts).map(function (k) { return [k, s.counts[k]]; });
        rows.push(['Em dashes (shown, not hidden)', dashes]);
        report(rows);
        output.value = fixInvisible(v);
      } else {
        hl.style.display = 'none';
        setHtmlView(htmlView);
        frame.srcdoc = previewDoc(v, $('optImages').checked);
        output.value = htmlToText(v, { links: $('optHtmlLinks').checked, altText: $('optAlt').checked });
        var d = new DOMParser().parseFromString(v, 'text/html');
        report([['Elements', d.body.querySelectorAll('*').length], ['Links', d.querySelectorAll('a[href]').length],
          ['Images', d.querySelectorAll('img').length], ['Scripts blocked', d.querySelectorAll('script').length],
          ['Words in text', (output.value.match(/\S+/g) || []).length]]);
      }
    }

    function schedule() { clearTimeout(timer); timer = setTimeout(run, input.value.length > 50000 ? 250 : 40); }

    root.querySelectorAll('[data-mode-tab]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode-tab')); }); });
    root.querySelectorAll('[data-html-view]').forEach(function (b) { b.addEventListener('click', function () { setHtmlView(b.getAttribute('data-html-view')); }); });
    root.querySelectorAll('.ac-opt').forEach(function (el) { el.addEventListener('change', run); });
    input.addEventListener('input', schedule);

    $('acCopy').addEventListener('click', function () {
      if (!output.value) { toast('Nothing to copy'); return; }
      navigator.clipboard.writeText(output.value).then(function () { if (window.ctfTrack) window.ctfTrack('tool_copy', { method: 'button', mode: mode }); toast(mode === 'hidden' ? 'Copied without hidden characters' : 'Copied!'); });
    });
    $('acSample').addEventListener('click', function () { input.value = mode === 'html' ? SAMPLES.html : SAMPLES.ai; run(); });
    $('acClear').addEventListener('click', function () { input.value = ''; run(); input.focus(); });
    $('acFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { input.value = rd.result; if (mode !== 'html' && /\.html?$/i.test(f.name)) setMode('html'); else run(); };
      rd.readAsText(f);
      e.target.value = '';
    });

    function toast(msg) {
      var el = $('toast');
      if (!el) return;
      el.textContent = msg; el.classList.add('show');
      setTimeout(function () { el.classList.remove('show'); }, 2000);
    }

    setMode(mode);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI); else initUI();
})();
