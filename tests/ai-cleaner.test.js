// Regression tests for src/ai-cleaner.js (pure functions). Run: node projects/cleantextfree/tests/ai-cleaner.test.js
// The code-preservation case was validated by reverting the fix: it fails without fence/inline-code protection.
const assert = require('assert');
const path = require('path');

global.window = {};
global.document = { readyState: 'complete', getElementById: () => null };
require(path.join(__dirname, '..', 'src', 'ai-cleaner.js'));
const { cleanAiText, scanInvisible } = window.CTFClean;

const OPTS = { markdown: true, invisible: true, citations: true, quotes: false, tidy: true, keepLinks: false, emDash: 'comma', bullets: 'dot' };
const clean = (s, o) => cleanAiText(s, Object.assign({}, OPTS, o)).text;

// Code inside fences and inline code must survive untouched ("your words are not changed").
{
  const src = 'Use **this**:\n\n```python\ndef __init__(self, *args, **kwargs):\n    x  = 2*3  # aligned\n    return self.__init__\n```\n\nCall `__init__` or `**kwargs` inline.';
  const out = clean(src);
  assert.ok(out.includes('def __init__(self, *args, **kwargs):'), 'fenced code mangled');
  assert.ok(out.includes('    x  = 2*3  # aligned'), 'fenced code spacing changed');
  assert.ok(out.includes('Call __init__ or **kwargs inline.'), 'inline code mangled');
  assert.ok(!out.includes('```'), 'fence lines not removed');
  assert.ok(out.startsWith('Use this:'), 'bold outside code not stripped');
}

// Markdown, dashes, hidden characters, citations.
{
  const out = clean('### Key Points\n\n- **Timeline:** moves to March 12 — on track​\n\n| A | B |\n|---|---|\n| 1 | 2 |\nSee【4†source】 end.');
  assert.strictEqual(out, 'Key Points\n\n• Timeline: moves to March 12, on track\n\nA\tB\n1\t2\nSee end.');
}

// Emoji ZWJ sequences are not "hidden characters"; stray ZWJ is.
{
  assert.strictEqual(scanInvisible('👨‍👩‍👧').total, 0);
  assert.strictEqual(scanInvisible('a‍b').total, 1);
  assert.strictEqual(clean('👨‍👩‍👧'), '👨‍👩‍👧');
  // Skin-tone modifier before the joiner (woman technologist, medium skin tone).
  const tech = '👩🏽‍💻';
  assert.strictEqual(scanInvisible(tech).total, 0, 'skin-tone ZWJ emoji flagged as hidden');
  assert.strictEqual(clean(tech), tech, 'skin-tone ZWJ emoji split');
}

// Things that look like Markdown but are not.
{
  assert.strictEqual(clean('snake_case_var and 2*3*4'), 'snake_case_var and 2*3*4');
}

// Perplexity numeric citations (lines from our Sept 2026 study answers); source-list lines and code stay.
{
  assert.strictEqual(clean('we launch with the best possible customer experience.[3][14]'), 'we launch with the best possible customer experience.');
  assert.strictEqual(clean('- **The same amount of money buys fewer things**[4][14][15]'), '• The same amount of money buys fewer things');
  assert.strictEqual(clean('Prices rose 3% [1, 2]. Rates fell[5] in May [1-3].'), 'Prices rose 3%. Rates fell in May.');
  assert.strictEqual(clean('[1] https://example.com/source'), '[1] https://example.com/source', 'source list line removed');
  assert.strictEqual(clean('Read `arr[1]` first.'), 'Read arr[1] first.', 'inline code citation-like index removed');
  // A numbered link-citation ([1](url), Claude/ChatGPT style; [[1]](url) Grok style) is a citation, not a link: it goes.
  assert.strictEqual(clean('See [the docs](https://a.com/x) and [1](https://b.com).'), 'See the docs and.');
  assert.strictEqual(clean('Fact [[2]](https://x.ai/news) here.'), 'Fact here.');
  assert.strictEqual(clean('See [1](https://b.com).', { citations: false }), 'See 1.', 'with citations off the link text stays');
  assert.strictEqual(clean('Up 4%[2]', { citations: false }), 'Up 4%[2]', 'citations toggle off still strips');
}

// Tracking parameters: AI utm always (with citations on); the rest only with the "all" toggle.
{
  const o = { keepLinks: true };
  assert.strictEqual(clean('Go to https://a.com/p?utm_source=chatgpt.com&id=5#top now', o), 'Go to https://a.com/p?id=5#top now');
  assert.strictEqual(clean('[Guide](https://a.com/g?utm_source=chatgpt.com)', o), 'Guide (https://a.com/g)');
  assert.strictEqual(clean('https://a.com/?utm_source=newsletter&x=1', o), 'https://a.com/?utm_source=newsletter&x=1', 'non-AI utm stripped by default');
  assert.strictEqual(clean('https://a.com/?utm_source=newsletter&gclid=9&x=1', Object.assign({ tracking: true }, o)), 'https://a.com/?x=1');
  assert.strictEqual(cleanAiText('https://a.com/?utm_source=perplexity', OPTS).stats.tracking, 1);
}

// --- 2026-11-07 package (research L5): each rule below was validated by running this file against the
// --- previous engine first (every block failed), then against the fixed one.

// B1: England / Scotland / Wales flags are tag sequences (1F3F4 + E0067.. + E007F), not hidden text.
{
  const england = '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
  const scotland = '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
  assert.strictEqual(clean('Go ' + england + ' and ' + scotland), 'Go ' + england + ' and ' + scotland, 'flag tag sequence destroyed');
  assert.strictEqual(scanInvisible(england).total, 0, 'flag tags counted as hidden');
  assert.strictEqual(clean('hi\u{E0001}\u{E0020}\u{E0068}there'), 'hithere', 'stray tag characters (hidden prompt) must still go');
}

// B2: GFM allows a one-dash delimiter row with alignment colons.
{
  assert.strictEqual(clean('| a | b |\n|:--|--:|\n| 1 | 2 |'), 'a\tb\n1\t2');
  assert.strictEqual(clean('| a | b |\n|:-:|-|\n| 1 | 2 |'), 'a\tb\n1\t2');
}

// B3: backslash escapes resolve to the literal character (CommonMark 2.4); other backslashes stay.
{
  assert.strictEqual(clean('\\*not italic\\* and \\# not a heading and 5\\_000'), '*not italic* and # not a heading and 5_000');
  assert.strictEqual(clean('Path C:\\Users\\me stays'), 'Path C:\\Users\\me stays');
}

// B4: setext heading underline (=====) goes like the --- one does.
{
  assert.strictEqual(clean('Title\n=====\n\nText'), 'Title\n\nText');
}

// B7: nested blockquote markers.
{
  assert.strictEqual(clean('> quote\n>> nested'), 'quote\nnested');
}

// B8: inline code is protected from the quotes step too.
{
  assert.strictEqual(clean('Use `don’t` and don’t', { quotes: true }), 'Use don’t and don\'t');
}

// B9: em dash between digits is a range (hyphen), and URLs are never touched.
{
  assert.strictEqual(clean('Years 2010—2020 and word — word'), 'Years 2010-2020 and word, word');
  assert.strictEqual(clean('Visit https://x.com/a—b now — ok'), 'Visit https://x.com/a—b now, ok');
}

// NFC on input; extra Default_Ignorable code points; variation selectors stay.
{
  assert.strictEqual(clean('cafe\u0301'), 'café');
  assert.strictEqual(clean('f\u2061(x) a\u034Fb c\u206Ad'), 'f(x) ab cd');
  assert.strictEqual(cleanAiText('f\u2061(x)', OPTS).stats.invisible, 1);
  assert.strictEqual(clean('⚠️ 1️⃣'), '⚠️ 1️⃣', 'variation selector or keycap removed');
}

// Gemini file-analysis leftovers.
{
  assert.strictEqual(clean('Intro [cite_start]the point [cite: 1, 2, 19] ends.'), 'Intro the point ends.');
  assert.strictEqual(cleanAiText('[cite_start]x [cite: 3]', OPTS).stats.citations, 2);
}

// Emoji toggle (default off): removes pictographs, ZWJ/skin-tone sequences, keycaps and flags; keeps © ® ™.
{
  const src = 'Done ✅ ship 🚀 by 👩🏽‍💻 team 1️⃣ in 🇵🇱 — © 2026 Acme™';
  assert.strictEqual(clean(src), 'Done ✅ ship 🚀 by 👩🏽‍💻 team 1️⃣ in 🇵🇱, © 2026 Acme™', 'emoji removed while toggle is off');
  assert.strictEqual(clean(src, { emoji: true }), 'Done ship by team in, © 2026 Acme™');
  assert.strictEqual(cleanAiText(src, Object.assign({ emoji: true }, OPTS)).stats.emoji, 5);
}

// Web-app copy artifacts measured in Chrome on 2026-11-09 (see research/2026-11 clipboard matrix).
{
  // Perplexity Copy button: source pills are domain-label links after the sentence.
  assert.strictEqual(clean('GDP of the bloc. [ec.europa](https://ec.europa.eu/x)\n\n- **Germany** led. [ec.europa](https://ec.europa.eu/y)'),
    'GDP of the bloc.\n\n• Germany led.');
  // ChatGPT Copy button: "([domain](url))" pills, "[image](url)" placeholders, pill labels on their own line, &#x20; entities.
  assert.strictEqual(clean('Margin.&#x20;\n\n[image](https://chatgpt.com/img)\n\nEurostat+1\n\n\n\nNext ([nytimes.com](https://nyt.com/a?utm_source=chatgpt.com)) end.'),
    'Margin.\n\nNext end.');
  // With "Keep link URLs" on, domain-label links are treated as links the user wants.
  assert.strictEqual(clean('See [ec.europa](https://ec.europa.eu/x).', { keepLinks: true }), 'See ec.europa (https://ec.europa.eu/x).');
  // Ordinary links with word labels are untouched by the pill rule.
  assert.strictEqual(clean('Read [the full report](https://a.com/r) now.'), 'Read the full report now.');
  // Entities inside URLs stay encoded (URL is parked).
  assert.strictEqual(clean('https://a.com/?x=1&amp;y=2 and a &amp; b', { keepLinks: true }), 'https://a.com/?x=1&amp;y=2 and a & b');
}

console.log('ai-cleaner: all tests passed');
