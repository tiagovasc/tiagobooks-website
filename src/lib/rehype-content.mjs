import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';
import { normalizeSiteLink, unavailableReason } from './link-policy.mjs';

const imageSizes = new Map();
export const internalLink = normalizeSiteLink;

// Keep content portable and reserve local image dimensions before downloads finish.
export default function rehypeContent() {
  return async tree => {
    const jobs = [];
    function walk(node) {
      if (node.type === 'element' && node.tagName === 'a' && node.properties?.href) {
        node.properties.href = internalLink(node.properties.href);
        const reason = unavailableReason(node.properties.href);
        if (reason) {
          node.tagName = 'span'; node.properties = { className: ['unavailable-link'], title: reason };
          node.children.push({type:'text',value:' (not yet available)'});
        }
      }
      if (node.type === 'element' && node.tagName === 'img') {
        const p = node.properties;
        p.loading ??= 'lazy'; p.decoding ??= 'async';
        if (typeof p.src === 'string' && p.src.startsWith('/uploads/')) {
          let file;
          try { file = resolve('public', '.' + decodeURIComponent(p.src.split('?')[0])); } catch { return; }
          const root = resolve('public/uploads') + sep;
          if (file.startsWith(root) && existsSync(file)) {
            if (!imageSizes.has(file)) imageSizes.set(file, sharp(file).metadata());
            jobs.push(imageSizes.get(file).then(size => {
              const swap = size.orientation >= 5;
              p.width ??= swap ? size.height : size.width;
              p.height ??= swap ? size.width : size.height;
            }));
          }
        }
      }
      for (const child of node.children || []) walk(child);
    }
    walk(tree); await Promise.all(jobs);
  };
}
