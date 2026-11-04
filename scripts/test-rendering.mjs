import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { unified } from 'unified';
import parse from 'remark-parse';
import gfm from 'remark-gfm';
import math from 'remark-math';
import rehype from 'remark-rehype';
import katex from 'rehype-katex';
import stringify from 'rehype-stringify';
import content, { internalLink } from '../src/lib/rehype-content.mjs';
const render = async md => String(await unified().use(parse).use(gfm)
  .use(math, {singleDollarTextMath:false}).use(rehype).use(content).use(katex).use(stringify).process(md));
assert.equal(internalLink('#user-content-fn-1'), '#user-content-fn-1');
assert.equal(internalLink('https://tiagovf.com/posts/introduction#preface'), '/posts/in-search-of-the-infinite-introduction#preface');
assert.equal(internalLink('https://elsewhere.test/posts/introduction'), 'https://elsewhere.test/posts/introduction');
assert.equal(internalLink('https://tiagovf.com/pages/not-imported'), '/pages/not-imported');
assert.doesNotMatch(await render('Costs $0.10 to $0.20, with $SPH and $gSPH.'), /class="katex/);
assert.match(await render('Inline $$E=mc^2$$.'), /class="katex/);
assert.match(await render('$$\nE=mc^2\n$$'), /katex-display/);
const currencyPost = readFileSync('src/content/posts/sci-hub-has-failed-this-is-what-we-need-to-build-instead.md','utf8');
assert.doesNotMatch(await render(currencyPost), /class="katex/);
const image = await render('![Cover](/uploads/ethics%20of%20beauty%203_125651.png)');
assert.match(image, /width="451"/); assert.match(image, /height="640"/);
assert.match(await render('A note.[^1]\n\n[^1]: A footnote.'), /href="#user-content-fn-1"/);
assert.match(await render('| A | B |\n| - | - |\n| 1 | 2 |'), /<table>/);
assert.match(await render('```js\nconsole.log("hello");\n```'), /<pre><code/);
for (const line of readFileSync('public/_redirects','utf8').split(/\r?\n/).filter(l=>l.startsWith('/posts/in-search'))) {
  const [from, to] = line.split(/\s+/); assert.equal(internalLink('https://tiagovf.com'+from), to);
  assert.ok(readFileSync(`src/content${to}.md`, 'utf8').startsWith('---'));
}
console.log('Rendering fixtures passed: currency, math, images, aliases, fragments, tables, code and footnotes.');
if (process.argv.includes('preview')) {
  const html = await render('# Formatting review\n\nPrices $0.10 to $0.20 stay readable. Inline $$E=mc^2$$.\n\n> A quotation with a [link](/search).\n\n| Item | Description |\n| --- | --- |\n| Example | A deliberately long table entry for small screens |\n\n```js\nconst answer = 42;\nconsole.log(answer);\n```\n\nA footnote.[^1]\n\n[^1]: Footnotes link back to the reference.\n\n$$\n\\sum_{n=1}^{\\infty} \\frac{1}{n^2}=\\frac{\\pi^2}{6}\n$$\n\n![The Ethics of Beauty book cover](/uploads/ethics%20of%20beauty%203_125651.png)');
  const css = [...readFileSync('dist/index.html','utf8').matchAll(/href="([^"]+\.css)"/g)].map(m=>`<link rel="stylesheet" href="${m[1]}">`).join('');
  writeFileSync('../UI_PARITY/formatting-fixture.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local formatting fixture</title>${css}<body><main class="e-content">${html}</main><script src="/js/enhancements.js" defer></script></body></html>`);
}
