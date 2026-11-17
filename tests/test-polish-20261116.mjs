// Phone and tablet polish regressions found on 16 November 2026 (third MVP-to-production pass).
// Each test pins a confirmed problem: every article shared the site's generic description in link
// previews, the first Blog thumbnails loaded lazily, the phone address bar ignored the site's own
// light/dark choice, the header name was a link across the empty row beside it, a public List row
// kept a blank star row for unrated books, and the phone Table hid the title under the Details column.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {postSummary} from '../src/lib/post-presentation.mjs';

const read=file=>readFile(fileURLToPath(new URL('../'+file,import.meta.url)),'utf8');

test('an article describes itself in link previews instead of repeating the site description',()=>{
  assert.equal(postSummary({data:{description:'Own description',subtitle:'Sub'},body:'Body'}),'Own description');
  assert.equal(postSummary({data:{subtitle:'A *book* review'},body:'Body'}),'A book review');
  const plain=postSummary({data:{title:'Example'},body:'![art](/a.webp)\n\nhttps://example.com/video\n\n> A quotation that should not open the summary of this article at all.\n\nShort line.\n\n'+'This opening paragraph has [a link](https://example.com) and **bold** words, and it keeps going for long enough that the summary must be shortened at a word boundary rather than in the middle of some unlucky word near the limit.'});
  assert.ok(plain.startsWith('This opening paragraph has a link and bold words'),plain);
  assert.ok(plain.length<=160&&plain.endsWith('…')&&!/\s…$/.test(plain),plain);
  assert.equal(postSummary({data:{protected:true,subtitle:'Secret'},body:'Secret body that must never reach a public description, however long it is.'}),'');
  assert.equal(postSummary({data:{title:'Example'},body:''}),'');
});

test('the article layout passes that summary and the first Blog thumbnails load eagerly',async()=>{
  const entry=await read('src/layouts/Entry.astro');
  assert.match(entry,/description=\{d\.description \|\| d\.subtitle \|\| \(kind === 'post' \? postSummary\(entry\) : ''\) \|\| undefined\}/);
  const cards=await read('src/layouts/PostCards.astro');
  assert.match(cards,/const early=shown\+\+<3/);
  assert.match(cards,/loading=\{early\?"eager":"lazy"\}/);
});

test('the browser bar colour follows the site appearance choice and returns to the system default',async()=>{
  const js=await read('public/unified.js');
  assert.match(js,/meta\[name="theme-color"\]/);
  assert.match(js,/m\.content=mode==='dark'\?'#000000':mode==='light'\?'#EDEDEA':m\.dataset\.auto/);
});

test('phone polish rules stay in the shared stylesheet',async()=>{
  const css=await read('public/unified.css');
  assert.match(css,/@media\(max-width:1100px\)\{\.site-shell \.shell-brand\{justify-self:start/);
  assert.match(css,/\.pc-mobile-date,\.pc-reading\{font-size:12px\}/);
  assert.match(css,/\.public-library \.lrow \.l-rating:not\(:has\(button\.on\)\)\{display:none!important\}/);
});

test('the phone Table keeps the title clear of the pinned Details column',async()=>{
  const html=await read('library/index.html');
  assert.match(html,/c\[0\]==="title"&&room>0\?Math\.max\(150,Math\.min\(c\[2\],room\)\):c\[2\]/);
  assert.match(html,/reduce\(function\(n,c\)\{return n\+width\(c\);\},0\)/);
});
