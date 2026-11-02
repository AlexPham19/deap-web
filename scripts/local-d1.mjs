import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readdirSync,readFileSync } from 'node:fs';
import path from 'node:path';
export function localD1(filename=':memory:',migrations=path.resolve('drizzle')){
 if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec('CREATE TABLE IF NOT EXISTS __care_preview_migrations (name TEXT PRIMARY KEY)');
 if(readdirSync(migrations).filter(n=>n.endsWith('.sql')).length===0)throw new Error('Generate migrations before previewing shared storage.');
 for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
   if(sqlite.prepare('SELECT name FROM __care_preview_migrations WHERE name=?').get(name))continue;
   sqlite.exec('BEGIN');try{sqlite.exec(readFileSync(path.join(migrations,name),'utf8'));sqlite.prepare('INSERT INTO __care_preview_migrations (name) VALUES (?)').run(name);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
 }
 const statement=(sql,args=[])=>({
   bind(...values){return statement(sql,values);},
   async first(){return sqlite.prepare(sql).get(...args)||null;},
   async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},
   async run(){return this._run();},
   _run(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};},
 });
 return {prepare:statement,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s._run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};
}
