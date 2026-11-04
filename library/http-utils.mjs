// Request helpers shared by the library server and the local Markdown editor.

// Collect the whole body before decoding: decoding chunk by chunk turns any multi-byte character
// split across two chunks into U+FFFD (this had already damaged one saved book description).
export async function readBody(req,limit){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)return null;chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}

// Browsers send Origin on cross-site posts; a missing header is allowed, an unparseable one (such as "null") is not.
export function sameOrigin(req){
  const origin=req.headers.origin;if(!origin)return true;
  try{return new URL(origin).host===req.headers.host;}catch{return false;}
}
