import {readFile} from 'node:fs/promises';import {parseEnv} from 'node:util';
export async function settings(){const env=parseEnv(await readFile(new URL('../triage/.env',import.meta.url),'utf8'));return {url:env.SUPABASE_URL,key:env.SUPABASE_SECRET_KEY,tenant:env.POC_TENANT_ID};}
export class Cloud{
 constructor({url,key,tenant,fetcher=fetch}){const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co'))throw Error('Supabaseの接続先を確認してください');this.url=u.origin;this.key=key;this.tenant=tenant;this.fetcher=fetcher;}
 async request(path,{method='GET',body,headers={},raw=false}={}){const response=await this.fetcher(this.url+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:this.key,...(this.key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+this.key}),'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:raw?body:JSON.stringify(body)})});if(!response.ok)throw Error(`Supabase処理に失敗しました（${response.status}）。入力は画面に残っています。`);if(response.status===204)return null;const text=await response.text();return text?JSON.parse(text):null;}
 rest(table,opts){return this.request('/rest/v1/'+table,opts);}
 async list(){return this.rest(`benefit_demo_cases?tenant=eq.${encodeURIComponent(this.tenant)}&select=id,revision,payload&order=id&limit=500`);}
 async get(id){const rows=await this.rest(`benefit_demo_cases?tenant=eq.${encodeURIComponent(this.tenant)}&id=eq.${encodeURIComponent(id)}&select=*`);if(!rows[0])throw Error('案件が見つかりません');return rows[0];}
 async save(row,payload){const rows=await this.rest(`benefit_demo_cases?tenant=eq.${encodeURIComponent(this.tenant)}&id=eq.${encodeURIComponent(row.id)}&revision=eq.${row.revision}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:{payload,revision:row.revision+1}});if(!rows.length)throw Error('別の操作で更新されています。案件を再読込してください');return rows[0];}
 async runResult(id){return (await this.rest(`benefit_demo_runs?tenant=eq.${encodeURIComponent(this.tenant)}&id=eq.${id}&select=payload`))[0]?.payload;}
 async saveRun(id,row,payload){return this.rest('benefit_demo_runs?on_conflict=tenant,id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:{tenant:this.tenant,id,case_id:row.id,revision:row.revision,payload}});}
 async search(words,month){return this.rest('rpc/benefit_search_docs',{method:'POST',body:{query_text:words,diagnosis_month:month}});}
 async loadKnowledge(){return this.rest('benefit_document_sections?select=id,document_id,page,body,metadata&order=id&limit=1000');}
}
