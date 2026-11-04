import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { parseFragment } from 'parse5';
import { walkHtml } from './html-links.mjs';
import { normalizeSiteLink } from './link-policy.mjs';

// Patch URL spans only, preserving prose, whitespace, frontmatter and code samples.
export function planMarkdownLinks(source, basePath) {
  const header=source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0]||'';
  const body=source.slice(header.length), changes=[], skipped=[];
  const add=(start,end,value)=>{
    const before=source.slice(start,end);if(before!==value)changes.push({start,end,before,after:value});
  };
  function walk(node) {
    if(['code','inlineCode'].includes(node.type))return;
    if(['link','image','definition'].includes(node.type)) {
      const replacement=normalizeSiteLink(node.url,{basePath});
      if(replacement!==node.url) {
        const start=header.length+node.position.start.offset,end=header.length+node.position.end.offset;
        const span=source.slice(start,end);
        if(node.type==='link'&&(span===node.url || /^<[^>]+>$/.test(span))) {
          add(start,end,`[${replacement.replace(/[\[\]]/g,'\\$&')}](<${replacement}>)`);
        } else {
          const offset=span.lastIndexOf(node.url);
          if(offset<0)skipped.push({start,reason:'Escaped URL requires manual review'});
          else add(start+offset,start+offset+node.url.length,replacement);
        }
      }
      return;
    }
    if(node.type==='html') {
      const tree=parseFragment(node.value,{sourceCodeLocationInfo:true});
      walkHtml(tree,tag=>{
        for(const attribute of tag.attrs||[]) {
          if(!['href','src','poster','action'].includes(attribute.name))continue;
          const value=normalizeSiteLink(attribute.value,{basePath});if(value===attribute.value)continue;
          const loc=tag.sourceCodeLocation?.attrs?.[attribute.name];if(!loc)continue;
          const start=header.length+node.position.start.offset+loc.startOffset,end=header.length+node.position.start.offset+loc.endOffset;
          add(start,end,`${attribute.name}="${value.replaceAll('&','&amp;').replaceAll('"','&quot;')}"`);
        }
      });return;
    }
    for(const child of node.children||[])walk(child);
  }
  walk(unified().use(remarkParse).use(remarkGfm).parse(body));
  changes.sort((a,b)=>a.start-b.start);
  for(let i=1;i<changes.length;i++)if(changes[i].start<changes[i-1].end)throw new Error('Overlapping edits');
  return {changes,skipped};
}
export function applyChanges(source,changes) {
  for(const change of [...changes].reverse()) {
    if(source.slice(change.start,change.end)!==change.before)throw new Error('Source changed since the plan');
    source=source.slice(0,change.start)+change.after+source.slice(change.end);
  }
  return source;
}
export function undoChanges(source,changes) {
  let shift=0;
  const inverse=changes.map(c=>{
    const start=c.start+shift;shift+=c.after.length-(c.end-c.start);
    return {start,end:start+c.after.length,before:c.after,after:c.before};
  });
  return applyChanges(source,inverse);
}
