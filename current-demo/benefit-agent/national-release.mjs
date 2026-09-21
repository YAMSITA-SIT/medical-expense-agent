import assert from 'node:assert/strict';import {Cloud,settings} from './cloud.mjs';
import {nationalCases} from './national-fixtures.mjs';import {scenarios} from './scenarios.mjs';import {annualCases} from './annual-fixtures.mjs';import {clinicalCases} from './clinical-fixtures.mjs';import {partitionCase} from './partition-fixtures.mjs';import {processCase} from './process.mjs';import {digest} from './store.mjs';
const db=new Cloud(await settings());
const existing=await db.list(),known=new Set([...scenarios(),...annualCases(),...clinicalCases(),...['different_insurance','insurance_change','relocation'].map(partitionCase)].map(r=>r.id));
let tagged=0;
for(const r of existing){if(known.has(r.id)&&r.payload.synthetic===true&&!r.payload.verification){const prior=digest({facts:r.payload.facts,draft:r.payload.draft});const saved=await db.save(r,{...r.payload,verification:{status:'SYNTHETIC_VERIFIED',evidence:'EXISTING-DEMO-FIXTURE-MIGRATION-2026-09-21'}});assert.equal(digest({facts:saved.payload.facts,draft:saved.payload.draft}),prior);tagged++;}}
for(const r of nationalCases()){assert.deepEqual(processCase(r).findings,[]);await db.rest('benefit_demo_cases?on_conflict=tenant,id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:{...r,tenant:db.tenant}});assert.equal((await db.get(r.id)).payload.user_id,r.payload.user_id);}
console.log(JSON.stringify({existing_synthetic_metadata_migrated:tagged,new_case_ids:nationalCases().map(r=>r.id),total_cases:(await db.list()).length}));
