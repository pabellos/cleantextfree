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

console.log('ai-cleaner: all tests passed');
