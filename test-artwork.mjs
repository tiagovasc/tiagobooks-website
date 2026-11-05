import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {load} from 'js-yaml';
import {parse} from 'parse5';
import sharp from 'sharp';
import {isBlogPostVisible} from './src/lib/post-presentation.mjs';
const walk=node=>[node,...(node.childNodes||[]).flatMap(walk)];
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');
const listed=[];
for(const file of await readdir('src/content/posts')){
  if(!file.endsWith('.md'))continue;
  const source=await readFile('src/content/posts/'+file,'utf8'),data=load(source.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  if(!data.draft&&!data.unlisted&&!data.protected)listed.push({slug:file.slice(0,-3),data});
}
const posts=listed.filter(p=>p.data.artwork);

test('every published post has an image and podcast episodes use their own thumbnails',async()=>{
  const blog=walk(parse(await readFile('dist/blog.html','utf8')));
  const checked=new Set();
  for(const {slug,data} of listed){
    assert.ok(data.image,`${slug} has no featured image`);
    const thumbnail=data.thumbnail||data.artwork?.thumbnail||data.image;
    if(isBlogPostVisible({data}))assert.ok(blog.some(n=>n.nodeName==='img'&&attr(n,'src')===thumbnail),`${slug} visible thumbnail missing`);
    if(data.tags.includes('Podcast')||slug.startsWith('podcast-')){
      assert.equal(data.artwork,undefined,`${slug} must use its episode thumbnail, not a painting`);
      assert.match(data.image,/^\/uploads\/podcasts\//);
    }
    for(const src of [data.image,thumbnail]){
      assert.match(src,/^\/uploads\/(artwork|podcasts|book-chapters)\/[A-Za-z0-9_-]+\.webp$/);
      if(checked.has(src))continue;checked.add(src);
      const img=sharp('public'+src),meta=await img.metadata();
      assert.ok(meta.width>=200&&meta.height>=100,src);
      assert.ok(!meta.exif&&!meta.xmp&&!meta.iptc,src);
      assert.ok((await img.raw().toBuffer()).length>0,src);
    }
  }
});
test('featured artwork decodes with correct dimensions and no embedded private metadata',async()=>{
  assert.ok(posts.length>0,'No artwork entries were checked');
  for(const {slug,data} of posts){
    assert.match(data.image,/^\/uploads\/artwork\/[a-z0-9-]+\.webp$/);
    const full=await sharp('public'+data.image).metadata();
    assert.equal(full.width,data.artwork.width,slug);assert.equal(full.height,data.artwork.height,slug);
    assert.ok(data.artwork.alt.length>20,slug);
    for(const src of [data.image,data.artwork.thumbnail]){
      const img=sharp('public'+src),meta=await img.metadata();
      assert.equal(meta.exif,undefined,src);assert.equal(meta.xmp,undefined,src);assert.equal(meta.iptc,undefined,src);
      assert.ok((await img.raw().toBuffer()).length>0,src);
    }
  }
});
test('artwork is credited in articles and feeds, and connected to cards and social previews',async()=>{
  const blog=walk(parse(await readFile('dist/blog.html','utf8'))),feed=await readFile('dist/posts_feed','utf8');
  for(const {slug,data} of posts){
    const nodes=walk(parse(await readFile(`dist/posts/${slug}.html`,'utf8')));
    const figures=nodes.filter(n=>n.nodeName==='figure'&&attr(n,'class')==='entry-artwork');
    assert.equal(figures.length,1,slug);assert.ok(text(figures[0]).includes(data.artwork.artist),slug);
    const hero=walk(figures[0]).find(n=>n.nodeName==='img');assert.equal(attr(hero,'src'),data.image);assert.equal(attr(hero,'alt'),data.artwork.alt);
    for(const name of ['og:image','twitter:image']){
      const meta=nodes.find(n=>n.nodeName==='meta'&&(attr(n,'property')===name||attr(n,'name')===name));
      assert.ok(attr(meta,'content')?.endsWith(data.image),`${slug} ${name}`);
    }
    assert.ok(blog.some(n=>n.nodeName==='img'&&attr(n,'src')===(data.thumbnail||data.artwork.thumbnail)),`${slug} card`);
    const entry=feed.split('<entry>').find(e=>e.includes(`Post/${slug}</id>`));
    if(entry){assert.ok(entry.includes(data.image),`${slug} feed image`);assert.ok(entry.includes(data.artwork.artist),`${slug} feed credit`)}
  }
});

test('book posts use their own illustrations as thumbnails, with the approved Appendix exception',async()=>{
  const chapters=listed.filter(p=>p.data.tags.includes('In Search of the Infinite'));
  assert.equal(chapters.length,19);
  for(const {slug,data} of chapters){
    if(slug==='in-search-of-the-infinite-appendix'){
      assert.equal(data.thumbnail,undefined);assert.match(data.artwork.thumbnail,/william-blake-albion-rose/);continue;
    }
    const source=await readFile(`src/content/posts/${slug}.md`,'utf8');
    const body=source.replace(/^---[\s\S]*?\r?\n---/,'');
    assert.match(body,/!\[[^\]]*\]\(\/?uploads\//,slug+' retains its original embedded image');
    assert.equal(data.thumbnail,`/uploads/book-chapters/${slug}-480.webp`);
  }
});
