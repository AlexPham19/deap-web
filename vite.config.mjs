import {defineConfig} from 'vite';
import worker from './worker/index.js';
import {localD1} from './scripts/local-d1.mjs';
import path from 'node:path';
// Development only: a fictional owner identity and SQLite, never production auth.
export default defineConfig({plugins:[{name:'care-local-api',configureServer(server){
 const db=localD1(path.resolve('.sites-runtime/care-preview.sqlite'));
 server.httpServer?.once('close',()=>db.close());
 server.middlewares.use(async(req,res,next)=>{
  if(!req.url?.startsWith('/api/'))return next();
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const origin=`http://${req.headers.host}`;const headers=new Headers(req.headers);
   headers.set('oai-authenticated-user-id','preview-owner');headers.set('oai-authenticated-user-email','preview@example.invalid');
   const request=new Request(new URL(req.url,origin),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const response=await worker.fetch(request,{DB:db,SMS_ADMIN_EMAIL:'preview@example.invalid',SMS_TEST_TO:'+15550000001',TWILIO_TRIAL_TEMPLATE:'sms_internal_alerts'},{});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:'Local API could not complete the request.'}));}
 });
}}]});
