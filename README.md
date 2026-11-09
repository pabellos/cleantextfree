# CleanTextFree — AI text cleaner

Removes `[1][2]`, `【4†source】`, `utm_source=chatgpt.com` and invisible characters from text copied out of ChatGPT, Claude, Gemini, Perplexity or Copilot. Does not change your words.

- Strips Markdown symbols: `**bold**`, `*italic*`, `###` headings, list markers, tables (to tab-separated), links
- Replaces em dashes with a comma or hyphen (or keeps them)
- Removes hidden Unicode characters: zero-width spaces, no-break spaces, soft hyphens, bidirectional marks
- Removes citation leftovers: Perplexity `[3][14]`, `[1](https://…)` link citations, `【4†source】`, Gemini `[cite_start]` / `[cite: 1, 2]`
- Removes `utm_source=chatgpt.com`-style tracking tags from links (optionally every `utm_`, `gclid`, `fbclid`)
- Optional emoji removal; emoji sequences and flags survive the hidden-character pass
- Resolves Markdown backslash escapes, GFM table alignment rows, setext underlines
- Leaves fenced and inline code untouched

Everything runs locally. No text is sent anywhere.

**Use it online:** [cleantextfree.com/ai-text-cleaner](https://www.cleantextfree.com/ai-text-cleaner) · also an [HTML viewer](https://www.cleantextfree.com/html-viewer) and [remove formatting](https://www.cleantextfree.com/) tool.

## What's in this repo

| Path | What |
|---|---|
| `src/ai-cleaner.js` | The cleaning engine (plain browser JS, exposes `window.CTFClean`) — the same file the website uses |
| `extension/` | Chrome extension (Manifest V3): toolbar popup + right-click "Clean AI text & copy" |
| `tests/` | Engine regression tests and an end-to-end test that loads the extension in Chromium |

## Engine API

```js
const { cleanAiText, scanInvisible, fixInvisible } = window.CTFClean;

const opts = { markdown: true, invisible: true, citations: true, quotes: false,
               tidy: true, keepLinks: false, emDash: 'comma', bullets: 'dot' };

cleanAiText('### Title\n\n- **Bold** item — done', opts).text;
// → 'Title\n\n• Bold item, done'

scanInvisible('a\u200Bb').total;   // → 1
fixInvisible('a\u200Bb');          // → 'ab'
```

## Extension

```bash
npm install
npm run build:extension      # copies src/ai-cleaner.js into extension/lib, renders icons, zips (zip step uses PowerShell)
npm run test:extension       # loads the unpacked extension in Chromium
```

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.

The extension requests no host permissions. It reads the selection only after you click one of its menu items (`activeTab`), makes no network requests and has no analytics.

## Tests

```bash
npm test
```

## License

MIT © 2026 Lightcraft Media Sp. z o.o. — [cleantextfree.com](https://www.cleantextfree.com/)
