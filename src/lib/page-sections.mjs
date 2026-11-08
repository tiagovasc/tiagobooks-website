import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { plainText } from './post-presentation.mjs';

const sections=body=>[...body.matchAll(/^##\s+(.+)\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/gm)];
const paragraphs=text=>text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
const html=async text=>String(await unified().use(remarkParse).use(remarkRehype).use(rehypeStringify).process(text));
function headingParts(heading){
  const clean=plainText(heading),year=clean.match(/\((\d{4})\)\s*$/)?.[1]||'';
  const name=clean.replace(/\s*\(\d{4}\)\s*$/,'');
  const colon=name.indexOf(': ');
  return {year,title:colon<0?name:name.slice(0,colon),subtitle:colon<0?'':name.slice(colon+2)};
}

export async function parseTalks(body){
  return Promise.all(sections(body).map(async([,heading,text])=>{
    const video=text.match(/https:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/);
    const transcript=text.match(/\[Transcript\]\((\/posts\/[^)]+)\)/)?.[1];
    if(!video||!transcript)throw Error('Talk needs a video and transcript: '+heading);
    const event=text.match(/^Event — (.+)$/m)?.[1]?.trim()||'';
    const description=paragraphs(text).filter(p=>!/^https?:/.test(p.trim())&&!/^\**Links:/.test(p.trim())&&!/^Event — /.test(p.trim())).join('\n\n');
    return {...headingParts(heading),event,id:video[1],transcript,href:`https://www.youtube.com/watch?v=${video[1]}`,image:`/uploads/video-${video[1]}.webp`,description:await html(description)};
  }));
}

export async function parseBooks(body){
  return Promise.all(sections(body).map(async([,heading,text])=>{
    const links=[...text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map(([,label,href])=>({label:plainText(label),href}));
    const forthcoming=/forthcoming/i.test(text);
    const publisher=plainText(text.match(/^_\(([^)]+)\)/m)?.[1]||'').replace(/^forthcoming,\s*/i,'');
    const description=paragraphs(text).filter(p=>!/^_\(forthcoming/i.test(p.trim())&&!/^\* \* \*/.test(p.trim())&&!/🔗/.test(p)).join('\n\n');
    const blog=links.find(l=>l.label==='Blog');
    const actions=['Blog','PDF','EPUB','Paperback'].map(label=>links.find(l=>l.label===label)).filter(Boolean);
    return {...headingParts(heading),forthcoming,publisher,description:await html(description),actions,
      image:blog?'/uploads/c3fab04d_98811.jpeg':null,href:blog?.href};
  }));
}
