import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
// Scope is constructed by authenticated backend adapters, never by LLM output.
export class Store{
 constructor(file=':memory:'){
  this.db=new DatabaseSync(file);this.db.exec(`
   CREATE TABLE IF NOT EXISTS facts(tenant TEXT,user_id TEXT,month TEXT,name TEXT,revision INTEGER,payload TEXT,PRIMARY KEY(tenant,user_id,month,name,revision));
   CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,tenant TEXT,user_id TEXT,month TEXT,fingerprint TEXT,result TEXT);
   CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,run_id TEXT,kind TEXT,payload TEXT);
   CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,tenant TEXT,user_id TEXT,month TEXT,fingerprint TEXT,status TEXT,payload TEXT);
   CREATE TRIGGER IF NOT EXISTS facts_immutable BEFORE UPDATE ON facts BEGIN SELECT RAISE(ABORT,'immutable fact'); END;
   CREATE TRIGGER IF NOT EXISTS events_immutable BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'immutable event'); END;
  `);
 }
 put(scope,name,value,{evidence,verified=true}={}){
  if(!evidence||typeof evidence!=='string'||typeof verified!=='boolean')throw Error('証拠参照と確認状態が必要です');
  const {tenant,user_id,month}=scope;const last=this.db.prepare('SELECT MAX(revision) AS r FROM facts WHERE tenant=? AND user_id=? AND month=? AND name=?').get(tenant,user_id,month,name).r||0;
  this.db.prepare('INSERT INTO facts VALUES(?,?,?,?,?,?)').run(tenant,user_id,month,name,last+1,JSON.stringify({value,evidence,verified}));
 }
 read(scope){const {tenant,user_id,month}=scope;const rows=this.db.prepare('SELECT name,revision,payload FROM facts WHERE tenant=? AND user_id=? AND month=? ORDER BY revision').all(tenant,user_id,month);return Object.fromEntries(rows.map(r=>[r.name,{...JSON.parse(r.payload),revision:r.revision}]));}
 event(id,kind,data){this.db.prepare('INSERT INTO events(run_id,kind,payload) VALUES(?,?,?)').run(id,kind,JSON.stringify(data));}
 save(scope,fingerprint,result,action){
  const id=digest({scope,fingerprint}),{tenant,user_id,month}=scope;this.db.exec('BEGIN IMMEDIATE');
  try{
   const existing=this.cached(scope,fingerprint);if(existing){this.db.exec('COMMIT');return id;}
   this.db.prepare('UPDATE outbox SET status=? WHERE tenant=? AND user_id=? AND month=? AND fingerprint<>? AND status=?').run('SUPERSEDED',tenant,user_id,month,fingerprint,'DRAFT');
   if(action)this.db.prepare('INSERT OR IGNORE INTO outbox VALUES(?,?,?,?,?,?,?)').run(id,tenant,user_id,month,fingerprint,'DRAFT',JSON.stringify({...action,sent:false,requires_approval:true}));
   this.db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?,?,?,?,?)').run(id,tenant,user_id,month,fingerprint,JSON.stringify(result));
   this.db.exec('COMMIT');return id;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 cached(scope,fingerprint){const r=this.db.prepare('SELECT result FROM runs WHERE id=?').get(digest({scope,fingerprint}));return r?JSON.parse(r.result):null;}
 close(){this.db.close();}
}
