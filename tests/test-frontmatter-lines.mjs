import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {load as yamlLoad} from 'js-yaml';
import {isExternalArticleUrl} from '../src/lib/linked-post.mjs';

const source=readFileSync(new URL('../astro.config.mjs',import.meta.url),'utf8');
function configFixture(ending){
  const files={
    'secret.md':`---\ntitle: Private\nprotected: true\n---\nBody`,
    'unlisted.md':`---\ntitle: Unlisted\nunlisted: true\n---\nBody`,
    'draft.md':`---\ntitle: Draft\ndraft: true\n---\nBody`,
    'linked.md':`---\ntitle: Linked\nexternalUrl: https://example.org/article\naliases: [/old-link]\n---\nBody`,
    'public.md':`---\ntitle: Public\n---\nBody`,
  };
  let redirects='';
  const context=vm.createContext({existsSync:p=>p==='src/content/posts',readdirSync:()=>Object.keys(files),
    readFileSync:p=>files[p.split('/').at(-1)].replaceAll('\n',ending),
    writeFileSync:(_file,text)=>{redirects=text},yamlLoad,isExternalArticleUrl,URL});
  const first=source.indexOf('function hiddenPaths()');
  const last=source.indexOf('// Mirrors Pika URL scheme:');
  assert.ok(first>=0&&last>first);
  vm.runInContext(source.slice(first,last)+';globalThis.result={hidden:[...hidden],plugin:aliasRedirects()};',context);
  context.result.plugin.hooks['astro:build:done']({dir:new URL('file:///fixture/dist/')});
  return {hidden:[...context.result.hidden],redirects};
}

test('LF frontmatter preserves hidden-route filtering and redirects',()=>{
  const result=configFixture('\n');
  assert.deepEqual(result.hidden,['/posts/secret','/posts/unlisted','/posts/draft']);
  assert.match(result.redirects,/\/posts\/linked https:\/\/example.org\/article 302/);
  assert.match(result.redirects,/\/old-link \/posts\/linked 301/);
});

test('Windows CRLF hidden metadata is excluded from the sitemap',()=>{
  assert.deepEqual(configFixture('\r\n').hidden,['/posts/secret','/posts/unlisted','/posts/draft']);
});

test('Windows CRLF aliases and external article destinations remain active',()=>{
  const result=configFixture('\r\n');
  assert.match(result.redirects,/\/posts\/linked https:\/\/example.org\/article 302/);
  assert.match(result.redirects,/\/old-link \/posts\/linked 301/);
});
