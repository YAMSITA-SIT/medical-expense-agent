import {applyReviewedFact} from './follow-up.mjs';
import http from 'node:http';import {readFile} from 'node:fs/promises';import {randomBytes} from 'node:crypto';
import {Cloud,settings} from './cloud.mjs';import {processCase,validate,fields} from './process.mjs';import {PATTERNS} from './catalog.mjs';
import {Approvals} from './approval.mjs';
import {DecisionAgent} from './decision-agent.mjs';
import {SEARCH_CHECKPOINT} from './retrieval.mjs';
const approvals=new Approvals();
const cloud=new Cloud(await settings()),token=randomBytes(32).toString('hex'),port=4176,origin=`http://127.0.0.1:${port}`,locks=new Map();
const decisionAgent=new DecisionAgent({documents:cloud});
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>250000)throw Error('入力が大きすぎます');}return JSON.parse(text||'{}');}
http.createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`){send(res,403,{error:'接続先が不正です'});return;}
 const url=new URL(req.url,origin),parts=url.pathname.split('/').filter(Boolean);
 if(req.method!=='GET'&&(req.headers.origin!==origin||req.headers['x-demo-token']!==token)){send(res,403,{error:'画面を再読込してください'});return;}
 if(url.pathname==='/api/session'){send(res,200,{token,patterns:PATTERNS,ai_configured:!!approvals.key,search_checkpoint:SEARCH_CHECKPOINT});return;}
 if(parts[0]==='api'&&parts[1]==='cases'){
  if(!parts[2]){send(res,200,(await cloud.list()).map(r=>({id:r.id,title:r.payload.title,revision:r.revision})));return;}
  const id=decodeURIComponent(parts[2]);let row=await cloud.get(id);
  if(req.method==='GET'){send(res,200,row);return;}
  const data=await body(req);if(data.revision!==row.revision){send(res,409,{error:'入力の版が変わっています。案件を再読込してください'});return;}
  if(SEARCH_CHECKPOINT&&['ai-preview','ai-approve'].includes(parts[3])){send(res,409,{error:'ご指定の文書検索段階で停止中です。AI推論・職員照会には進みません'});return;}
  if(parts[3]==='ai-preview'){const result=await cloud.runResult(data.run_id);if(!result||result.revision!==row.revision||processCase(row).id!==result.id)throw Error('最新の判定結果が必要です');send(res,200,approvals.prepare(result,row.id));return;}
  if(parts[3]==='ai-approve'){const result=await approvals.approve(data.approval_id,row);const current=await cloud.get(id);if(current.revision!==row.revision)throw Error('AI処理中に入力が変更されました。再処理してください');await cloud.saveRun(data.approval_id,row,result);send(res,200,result);return;}
  if(parts[3]==='reviewed-fact'){const payload=applyReviewedFact(row,data);processCase({...row,revision:row.revision+1,payload});row=await cloud.save(row,payload);send(res,200,{id:row.id,revision:row.revision,state:'READY_TO_REPROCESS'});return;}
  if(parts[3]==='statements'){validate(data.draft);if(data.draft.length!==row.payload.draft.length||data.draft.some(r=>!row.payload.draft.some(s=>s.id===r.id)))throw Error('明細IDが一致しません');const draft=data.draft.map(r=>({id:r.id,...Object.fromEntries(fields.map(k=>[k,r[k]??null]))}));row=await cloud.save(row,{...row.payload,draft});send(res,200,row);return;}
  if(parts[3]==='runs'){
   const key=id+':'+row.revision;if(!locks.has(key))locks.set(key,(async()=>{const result=await decisionAgent.run(row),cached=await cloud.runResult(result.id);if(cached&&result.state!=='DOCUMENT_SEARCH_FAILED')return {...cached,reused:true};
    const current=await cloud.get(id);if(current.revision!==row.revision)throw Error('処理中に入力が変更されました。再実行してください');await cloud.saveRun(result.id,row,result);return result;})().finally(()=>locks.delete(key)));
   send(res,200,await locks.get(key));return;
  }
 }
 if(parts[0]==='api'&&parts[1]==='runs'&&req.method==='GET'){const result=await cloud.runResult(parts[2]);send(res,result?200:404,result||{error:'結果がありません'});return;}
 if(req.method==='GET'&&['/','/app.js','/style.css'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname.slice(1),content=await readFile(new URL('./web/'+file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'",'Cache-Control':'no-store'});res.end(content);return;}
 send(res,404,{error:'見つかりません'});
 }catch(e){send(res,400,{error:e.message==='fetch failed'?'DBに接続できません。入力は保存せず画面に保持しています。':e.message});}
}).listen(port,'127.0.0.1',()=>console.log(origin));
