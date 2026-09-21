import {digest} from './store.mjs';
import {evaluate,RULE_VERSION} from './rules.mjs';
import {DOCUMENTS,REVIEW_SKILL} from './catalog.mjs';
export class Agent{
 constructor({store,planner=null}){this.store=store;this.planner=planner;}
 async run(scope){
  if(!scope||!['tenant','user_id','month'].every(k=>typeof scope[k]==='string'&&scope[k])||!/^\d{4}-(0[1-9]|1[0-2])$/.test(scope.month))throw Error('バックエンドが確定した利用者・対象月が必要');
  const facts=this.store.read(scope),fingerprint=digest({scope,facts,RULE_VERSION,DOCUMENTS,REVIEW_SKILL,planner:this.planner?.version||'deterministic'});
  const cached=this.store.cached(scope,fingerprint);if(cached)return {...cached,reused:true};
  const id=digest({scope,fingerprint});this.store.event(id,'DB_READ',{names:Object.keys(facts),revisions:Object.fromEntries(Object.entries(facts).map(([k,v])=>[k,v.revision]))});
  const evaluated=evaluate(scope,facts);this.store.event(id,'RULES_EVALUATED',evaluated);
  if(!evaluated.findings.length){const result={state:'MONTHLY_PROPOSAL',fingerprint,...evaluated};this.store.save(scope,fingerprint,result);return result;}
  // Local, reviewed document index. No model-provided URL is fetched.
  const docs=[DOCUMENTS[scope.month>='2026-08'?'reform':'guide'],DOCUMENTS.law];
  this.store.event(id,'DOCUMENTS_READ',{documents:docs.map(d=>({id:d.id,version:d.version})),skill:{id:REVIEW_SKILL.id,version:REVIEW_SKILL.version}});
  const options=evaluated.findings.map((f,index)=>({id:String(index),issue_id:f.id,kind:'PREPARE_REQUEST',recipient:f.owner,question:f.detail+'。確認資料と証拠参照を回答してください。',sources:docs.map(d=>d.id)}));
  let choice={option_id:'0',question:options[0].question,source_ids:options[0].sources},generator='DETERMINISTIC_FALLBACK';
  if(this.planner){
   try{
    const proposed=await this.planner.choose({findings:evaluated.findings,options,documents:docs,skill:REVIEW_SKILL});
    if(!proposed||Object.keys(proposed).some(k=>!['option_id','question','source_ids'].includes(k))||!options.some(o=>o.id===proposed.option_id)||typeof proposed.question!=='string'||!proposed.question.trim()||proposed.question.length>2000||!Array.isArray(proposed.source_ids)||!proposed.source_ids.length||proposed.source_ids.some(s=>!docs.some(d=>d.id===s)))throw Error('選択肢・根拠の検証に失敗');
    choice=proposed;generator='AI';
   }catch{this.store.event(id,'AI_PLAN_REJECTED',{fallback:true});}
  }
  const selected=options.find(o=>o.id===choice.option_id),action={...selected,question:choice.question,sources:choice.source_ids,generator,skill_version:REVIEW_SKILL.version};
  if(digest(this.store.read(scope))!==digest(facts)){
   this.store.event(id,'FACTS_CHANGED_DURING_PLAN',{retry_required:true});
   return {state:'RETRY_REQUIRED',proposal:null,reason:'文書作成中に資料が更新されたため再実行してください。'};
  }
  // Preparing an outbox draft is executable; sending is a separate authorized operation.
  const result={state:selected.recipient==='CITIZEN'?'WAITING_CITIZEN_REQUEST_APPROVAL':'WAITING_STAFF',fingerprint,findings:evaluated.findings,next_action:action,proposal:null};
  this.store.save(scope,fingerprint,result,action);this.store.event(id,'REQUEST_PREPARED',{issue_id:action.issue_id,recipient:action.recipient,sent:false});return this.store.cached(scope,fingerprint);
 }
}
export class OrcaPlanner{
 constructor({key,model='orcarouter/auto',fetcher=fetch}){if(!key)throw Error('API未設定');this.key=key;this.model=model;this.fetcher=fetcher;this.version='orca-next-action-v1:'+model;}
 async choose(context){
  const response=await this.fetcher('https://api.orcarouter.ai/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+this.key,'Content-Type':'application/json'},body:JSON.stringify({model:this.model,max_tokens:900,messages:[{role:'system',content:context.skill.instructions+' JSONだけを返す。形式 {"option_id":"提示されたid","question":"照会案","source_ids":["資料id"]}。'}, {role:'user',content:JSON.stringify(context)}]})});
  if(!response.ok)throw Error('AI接続失敗');const body=await response.json();if(body.choices?.[0]?.finish_reason!=='stop')throw Error('AI応答未完了');return JSON.parse(body.choices[0].message.content);
 }
}
