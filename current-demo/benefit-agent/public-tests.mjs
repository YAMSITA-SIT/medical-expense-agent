import test from 'node:test';import assert from 'node:assert/strict';
import {publicCase} from './public-fixtures.mjs';import {processCase} from './process.mjs';import {familyCaps} from './public-coordination.mjs';import {nationalBasis} from './national.mjs';
test('難病 配分は最高上限/合計、10円未満切捨て',()=>assert.deepEqual(familyCaps([{id:'a',base_limit:10000},{id:'b',base_limit:5000}]),{a:6660,b:3330}));
test('ゼロ上限配分',()=>assert.deepEqual(familyCaps([{id:'a',base_limit:0},{id:'b',base_limit:0}]),{a:0,b:0}));
for(const [kind,amount] of [['FAMILY',50010],['HIGH-COST',590010],['TWO-PROGRAMS',45000],['WELFARE',0],['WELFARE-PAID',null]])test(kind,()=>{const x=processCase(publicCase(kind));assert.equal(x.total_additional,amount,JSON.stringify(x.findings));if(kind==='WELFARE'){assert.equal(x.components[0].entitlement,30000);assert.equal(x.components[0].additional,0);assert.match(x.message,/医療機関/);}});
for(const [name,mutate] of [
 ['認定なし',f=>delete f.public_coordination.evidence],
 ['重複公費',f=>f.public_coordination.grants[1].statement_ids=[f.statements[0].id]],
 ['配分不整合',f=>f.public_coordination.allocations[0].insurance_entitlement=1],
 ['配分前上限不整合',f=>f.public_coordination.family.members[0].base_limit=5000],
 ['世帯名簿不完全',f=>f.public_coordination.family.complete=false],
 ['認定期間外',f=>f.public_coordination.grants[0].through='2026-06-30'],
 ['二重既払',f=>f.public_coordination.grants[0].already_paid=999999],
 ['配分行重複',f=>f.public_coordination.allocations[1]=f.public_coordination.allocations[0]],
 ['医療機関違い',f=>f.public_coordination.grants[0].providers=['OTHER']],
 ['不明な公費',f=>f.public_coordination.grants[0].program='UNKNOWN'],
])test(name,()=>{const r=publicCase();mutate(r.payload.facts);assert.equal(processCase(r).total_additional,null);});
test('再実行同一算定・異なる入力版',()=>{const r=publicCase(),a=processCase(r),b=processCase(r);assert.equal(a.id,b.id);r.revision++;assert.notEqual(processCase(r).id,a.id);});
test('修正明細は古い認定に流用しない',()=>{const r=publicCase();r.payload.draft[0].cash++;assert.equal(processCase(r).total_additional,null);});
test('精神通院高所得の特例期限',()=>{const r=publicCase('TWO-PROGRAMS'),f=r.payload.facts;r.payload.month='2027-04';for(const s of f.statements)s.date='2027-04-10';for(const k of ['qualification','income']){f[k].from='2027-04-01';f[k].through='2027-04-30';}for(const a of f.public_coordination.grants){a.from='2027-04-01';a.through='2027-04-30';}Object.assign(f.public_coordination.grants[1],{income_class:'high',severe_continuing:true});f.public_coordination.basis=nationalBasis(f);r.payload.draft=structuredClone(f.statements);assert.equal(processCase(r).total_additional,null);});

for(const kind of ['WELFARE-INSURED','WELFARE-NANBYO'])test(kind,()=>{const r=processCase(publicCase(kind));assert.equal(r.total_additional,0,JSON.stringify(r.findings));assert.equal(r.monthly.entitlement,212570);assert.equal(r.components.reduce((n,c)=>n+c.entitlement,0),87430);});

test('同一人の上限二重適用を止める',()=>{const r=publicCase();r.payload.facts.public_coordination.grants[1].person=r.payload.facts.public_coordination.grants[0].person;assert.equal(processCase(r).total_additional,null);});
