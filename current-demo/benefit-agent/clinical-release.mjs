import assert from 'node:assert/strict';import {Cloud,settings} from './cloud.mjs';import {clinicalCases} from './clinical-fixtures.mjs';import {processCase} from './process.mjs';
const db=new Cloud(await settings());
for(const row of clinicalCases()){
 const r=processCase(row);assert.deepEqual(r.findings,[]);
 await db.rest('benefit_demo_cases?on_conflict=tenant,id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:{...row,tenant:db.tenant}});
 const saved=await db.get(row.id);assert.equal(saved.payload.pattern,row.payload.pattern);console.log(row.id,r.monthly.additional);
}
