import { readdirSync,readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve('.sites-runtime/client-dist');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const assets={};
for(const f of readdirSync(root,{recursive:true,withFileTypes:true}).filter(f=>f.isFile())){
  const filename=path.join(f.parentPath,f.name);const relative=path.relative(root,filename).replaceAll('\\','/');
  if(relative.startsWith('.'))continue;
  assets['/'+relative]={type:types[path.extname(filename)]||'application/octet-stream',data:readFileSync(filename).toString('base64')};
}
const template=readFileSync('worker/index.js','utf8');const marker='const APP_ASSETS = null; // @build-assets';
if(!template.includes(marker))throw new Error('Worker asset insertion point missing.');
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));if(manifest.static)throw new Error('Remove the static hosting declaration before building this Worker.');
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
writeFileSync('dist/server/index.js',template.replace(marker,`const APP_ASSETS = ${JSON.stringify(assets)};`));
writeFileSync('dist/.openai/hosting.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Built Sites Worker with SMS API and ${Object.keys(assets).length} embedded React/PWA assets.`);
