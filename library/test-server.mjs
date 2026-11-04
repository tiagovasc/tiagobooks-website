import test from 'node:test';
import assert from 'node:assert/strict';
import {validBooks,server} from './server.mjs';
test('rating writes reject invalid values and duplicate IDs',()=>{
 const book={id:'1',title:'A book',rating:4};assert.equal(validBooks([book]),true);
 for(const rating of [-1,6,2.5,'4',null])assert.equal(validBooks([{...book,rating}]),false);
 assert.equal(validBooks([book,book]),false);
});
test('private tooling is never served',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const route of ['/_build/before-books.json','/server.mjs','/.env','/supabase.sql']){const r=await fetch(`http://127.0.0.1:${server.address().port}${route}`);assert.equal(r.status,404);}}
 finally{await new Promise(resolve=>server.close(resolve));}
});
test('public library is readable but saving requires a session',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}`;assert.equal((await fetch(base+'/save',{method:'POST',body:'[]'})).status,401);const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/window.CLOUD_CAN_EDIT=false/);}
 finally{await new Promise(resolve=>server.close(resolve));}
});
test('password enables editing with an HttpOnly session',async()=>{
 process.env.LIBRARY_PASSWORD='isolated-test-password';process.env.SESSION_SECRET='isolated-test-session-secret';
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const wrong=await fetch(base+'/login',{method:'POST',body:'password=wrong',redirect:'manual'});assert.equal(wrong.status,401);
  const login=await fetch(base+'/login',{method:'POST',body:'password=isolated-test-password',redirect:'manual'});assert.equal(login.status,303);
  const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly; SameSite=Strict/);
  const page=await fetch(base+'/',{headers:{Cookie:cookie.split(';')[0]}});assert.match(await page.text(),/window.CLOUD_CAN_EDIT=true/);
 }finally{delete process.env.LIBRARY_PASSWORD;delete process.env.SESSION_SECRET;await new Promise(resolve=>server.close(resolve));}
});
