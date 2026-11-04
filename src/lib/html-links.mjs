import { parse, parseFragment, serialize } from 'parse5';
import { normalizeSiteLink, absoluteSiteLink, unavailableReason } from './link-policy.mjs';

export function walkHtml(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walkHtml(child, visit);
  if (node.content) walkHtml(node.content, visit);
}
export const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;

export function rewriteHtml(html, { basePath = '/', fragment = false, redirectMap } = {}) {
  const tree = fragment ? parseFragment(html) : parse(html);
  walkHtml(tree, node => {
    for (const a of node.attrs || []) {
      if (['href','src','poster','action'].includes(a.name)) {
        const absolute = node.tagName === 'link' && ['canonical','alternate','sitemap'].includes(attr(node,'rel'));
        a.value = (absolute ? absoluteSiteLink : normalizeSiteLink)(a.value, {basePath, redirectMap});
      }
      if (node.tagName === 'meta' && a.name === 'content' && ['og:url','og:image','twitter:image'].includes(attr(node,'property') || attr(node,'name'))) {
        a.value = absoluteSiteLink(a.value, {basePath, redirectMap});
      }
    }
    if (node.tagName === 'a') {
      const href = attr(node,'href');
      const reason = href && unavailableReason(href);
      if (reason) {
        node.tagName = node.nodeName = 'span';
        node.attrs = [{name:'class',value:'unavailable-link'},{name:'title',value:reason}];
        node.childNodes.push({nodeName:'#text',value:' (not yet available)',parentNode:node});
      } else if (href?.startsWith('/') && !href.startsWith('//')) {
        node.attrs = node.attrs.filter(a=>a.name !== 'target');
      }
    }
  });
  return serialize(tree);
}
