import http from 'node:http';
import { readFileSync } from 'node:fs';
import worker from '../dist/server/index.js';
// Local preview sends no real messages unless explicit local credentials are supplied.
const env={};
if(process.env.SMS_PREVIEW_CONFIG)Object.assign(env,JSON.parse(readFileSync(process.env.SMS_PREVIEW_CONFIG,'utf8')));
const port=Number(process.env.PORT||5175);
http.createServer(async(req,res)=>{
  try{
    const url=`http://127.0.0.1:${port}${req.url}`;const chunks=[];for await(const c of req)chunks.push(c);
    const headers=new Headers(req.headers);headers.set('oai-authenticated-user-email',env.SMS_ADMIN_EMAIL||'preview@example.invalid');
    const request=new Request(url,{method:req.method,headers,...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,{...env,SMS_ADMIN_EMAIL:env.SMS_ADMIN_EMAIL||'preview@example.invalid'},{});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Preview error');}
}).listen(port,'127.0.0.1',()=>console.log(`Worker preview: http://127.0.0.1:${port} (local identity stub; not production authentication)`));
