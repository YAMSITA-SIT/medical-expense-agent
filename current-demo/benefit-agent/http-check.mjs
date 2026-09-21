import assert from 'node:assert/strict';
const base='http://127.0.0.1:4176',session=await(await fetch(base+'/api/session')).json();
async function call(path,body){const res=await fetch(base+path,{method:body?'POST':'GET',headers:body?{Origin:base,'Content-Type':'application/json','X-Demo-Token':session.token}:{},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};}
const row=(await call('/api/cases/P29-2')).data;
const runs=await Promise.all([call('/api/cases/P29-2/runs',{revision:row.revision}),call('/api/cases/P29-2/runs',{revision:row.revision})]);
assert.equal(runs[0].status,200);assert.equal(runs[0].data.id,runs[1].data.id);assert.equal(runs[0].data.monthly.additional,0);
const saved=await call('/api/runs/'+runs[0].data.id);assert.ok(saved.data.input_snapshot);assert.equal(saved.data.revision,row.revision);
const invalid=await call('/api/cases/P29-2/statements',{revision:row.revision,draft:[{...row.payload.draft[0],cash:-1}]});assert.equal(invalid.status,400);
assert.equal((await call('/api/cases/P29-2')).data.revision,row.revision);
const stale=await call('/api/cases/P29-2/runs',{revision:row.revision-1});assert.equal(stale.status,409);
const denied=await fetch(base+'/api/cases/P29-2/runs',{method:'POST',body:'{}'});assert.equal(denied.status,403);
console.log('HTTP検証：並行実行・保存・入力保持・版管理・未承認アクセス拒否が成功');
const missing=(await call('/api/cases/P32-1')).data;
const searched=await call('/api/cases/P32-1/runs',{revision:missing.revision});
assert.equal(searched.data.state,'PAUSED_AFTER_DOCUMENT_SEARCH');assert.ok(searched.data.sources.some(s=>s.id==='guide-5'));assert.equal(searched.data.monthly,null);assert.equal(searched.data.retrieval.ai_called,false);
for(const endpoint of ['ai-preview','ai-approve']){const gate=await call('/api/cases/P32-1/'+endpoint,{revision:missing.revision,run_id:searched.data.id,approval_id:'not-approved'});assert.equal(gate.status,409);assert.match(gate.data.error,/文書検索段階で停止/);}
const partition=(await call('/api/cases/PARTITION-different_insurance')).data;
const calculated=await call('/api/cases/'+partition.id+'/runs',{revision:partition.revision});assert.equal(calculated.data.monthly.additional,425140);assert.equal(calculated.data.retrieval,undefined);
console.log('Agent結合検証：別保険算定・Supabase本文検索・検索後停止・AI経路遮断が成功');
