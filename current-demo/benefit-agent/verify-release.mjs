import assert from 'node:assert/strict';
import {Cloud,settings} from './cloud.mjs';import {annualCases} from './annual-fixtures.mjs';import {searchIssue} from './retrieval.mjs';
const db=new Cloud(await settings());
// Add separate demo IDs. Never overwrite staff edits in existing cases.
for(const row of annualCases())await db.rest('benefit_demo_cases?on_conflict=tenant,id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:{...row,tenant:db.tenant}});
const docs=await db.rest('benefit_documents?select=id,sha256,storage_path,metadata');
assert.ok(docs.some(d=>d.id==='overview'));const sections=await db.loadKnowledge();assert.equal(sections.length,54);
for(const month of ['2026-08','2027-07']){
 const hits=searchIssue({id:'P32'},{month,members:[{age:45}]},sections).hits;
 assert.ok(hits.length);assert.ok(hits.every(h=>['reform-4','overview-2'].includes(h.id)));
 const rpc=await db.search('所得',month);assert.ok(rpc.length);assert.ok(rpc.every(h=>['reform-4','overview-2'].includes(h.id)));
}
const annualRows=(await db.list()).filter(r=>r.id.startsWith('ANNUAL-'));assert.equal(annualRows.length,7);
console.log(JSON.stringify({documents:docs.map(d=>({id:d.id,sha256:d.sha256,storage_path:d.storage_path})),pages:sections.length,annual_demo_cases:annualRows.length,period_search:'verified including legacy RPC'}));
