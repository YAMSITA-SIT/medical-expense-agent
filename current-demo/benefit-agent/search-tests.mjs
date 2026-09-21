import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {searchIssue,retrieveUnresolved} from './retrieval.mjs';import {DecisionAgent} from './decision-agent.mjs';import {scenarios} from './scenarios.mjs';
import {sectionsFor} from './knowledge/manifest.mjs';
export const corpus=sectionsFor(JSON.parse(readFileSync(new URL('./knowledge/sections.json',import.meta.url))));
const context={month:'2026-07',members:[{age:45}]};
// Hand-labelled references after reading the actual original pages. Includes
// negatives; returning an unrelated page is not treated as successful recall.
import {benchmarks} from './search-benchmark.mjs';
for(const [label,issue,ctx,expected] of benchmarks)test('検索 '+label,()=>{const r=searchIssue(issue,ctx,corpus);if(expected.length)assert.ok(r.hits.some(h=>expected.includes(h.id)),JSON.stringify(r));else assert.equal(r.hits.length,0);assert.equal(r.sufficient_for_calculation,false);assert.ok(r.hits.every(h=>!['guide-1','guide-2','guide-8','reform-1'].includes(h.id)));});
test('検索結果は原文・ページ・時点・一致語を保持',async()=>{const r=await retrieveUnresolved([{id:'P32'}],context,{loadKnowledge:async()=>corpus});const hit=r.sources[0];assert.equal(hit.body,corpus.find(s=>s.id===hit.id).body);assert.ok(hit.citation_url.endsWith('#page='+hit.page));assert.equal(r.ai_called,false);assert.equal(r.next_stage,'PAUSED_BEFORE_REASONING');});
test('Agentは算定可能なら文書検索を省略',async()=>{let calls=0;const a=new DecisionAgent({documents:{loadKnowledge:async()=>{calls++;return corpus;}}});const r=await a.run({...scenarios()[0],revision:1});assert.equal(r.monthly.additional,212570);assert.equal(calls,0);});
test('Agentは未解決時に検索して停止し自動推論・照会を行わない',async()=>{let calls=0;const a=new DecisionAgent({documents:{loadKnowledge:async()=>{calls++;return corpus;}}});const r=await a.run({...scenarios().find(s=>s.id==='P32-1'),revision:1});assert.equal(calls,1);assert.equal(r.state,'PAUSED_AFTER_DOCUMENT_SEARCH');assert.equal(r.monthly,null);assert.equal(r.retrieval.ai_called,false);assert.equal(r.retrieval.staff_request_sent,false);});
test('検索障害を根拠なしや給付なしに変換しない',async()=>{const a=new DecisionAgent({documents:{loadKnowledge:async()=>{throw Error('network');}}});const r=await a.run({...scenarios().find(s=>s.id==='P32-1'),revision:1});assert.equal(r.state,'DOCUMENT_SEARCH_FAILED');assert.equal(r.monthly,null);assert.equal(r.conclusion,'情報不足');});
