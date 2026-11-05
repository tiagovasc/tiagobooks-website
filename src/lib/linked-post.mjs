// Optional destination for an article published elsewhere; ordinary posts keep their permalink.
export function isExternalArticleUrl(value){
 if(typeof value!=='string'||/[\u0000-\u0020\u007f]/.test(value))return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password}catch{return false}
}
export const postHref=post=>post.data.externalUrl||`/posts/${post.id}`;
