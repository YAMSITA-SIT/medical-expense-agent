import test from 'node:test';import assert from 'node:assert/strict';import {coordinationCase,coordinatedAnnualCase} from './coordination-fixtures.mjs';import {processCase} from './process.mjs';
for(const [kind,expected] of [['CHILD',50010],['NO-VISIT',23340],['OVERLAP',27500],['PARTIAL-LINES',12500],['UNINSURED-PUBLIC',0],['APPROVED-ADVANCE',3000],['SPECIAL-DISEASE',290000],['AGE75',51000],['PARTITION',110000],['MIDMONTH',20000],['CERTIFICATE-CHANGE',25000],['PROTECTION-START',42000]])test(kind,()=>{const r=processCase(coordinationCase(kind));assert.equal(r.total_additional,expected,JSON.stringify(r.findings));for(const l of r.calculation_ledger){assert.equal(l.eligible_cost,l.ordinary_insurance+l.high_cost+l.public_benefits.reduce((n,p)=>n+p.amount,0)+l.patient_liability);}});

import {baseCap} from './public-coordination.mjs';import {nationalBasis} from './national.mjs';import {careBasis} from './care-periods.mjs';
for(const [group,severe,cap] of [['low1',false,1250],['low2',false,2500],['general1',false,5000],['general1',true,2500],['general2',false,10000],['general2',true,5000],['high',false,15000],['high',true,10000]])test('小児慢性上限 '+group+'/'+severe,()=>assert.equal(baseCap({program:'CHILD_CHRONIC',income_class:group,severe},'2026-07'),cap));
test('小児慢性人工呼吸器',()=>assert.equal(baseCap({program:'CHILD_CHRONIC',ventilator:true},'2026-07'),500));
for(const [name,kind,mutate] of [
 ['小児慢性20歳','CHILD',f=>f.qualification.members[1].age=20],
 ['小児慢性19歳継続証拠なし','CHILD',f=>f.qualification.members[1].age=19],
 ['未受診者の認定証なし','NO-VISIT',f=>delete f.public_coordination.family.members[1].certificate],
 ['部分診療合計不一致','PARTIAL-LINES',f=>f.public_coordination.service_lines[0].total--],
 ['部分診療証拠なし','PARTIAL-LINES',f=>f.public_coordination.service_lines[0].verified=false],
 ['立替個別決定なし','APPROVED-ADVANCE',f=>delete f.public_coordination.welfare.reimbursement.decision_id],
 ['立替認定過大','APPROVED-ADVANCE',f=>f.public_coordination.welfare.reimbursement.recognized_amount=999999],
 ['立替認定先違い','APPROVED-ADVANCE',f=>f.public_coordination.welfare.reimbursement.recipient='PROVIDER'],
 ['保護切替日不一致','PROTECTION-START',f=>f.care_periods.protection_start='2026-07-16'],
 ['保護開始証拠なし','PROTECTION-START',f=>delete f.care_periods.protection_decision],
 ['保護開始明細重複','PROTECTION-START',f=>f.care_periods.periods[1].facts.statements=f.care_periods.periods[0].facts.statements],
])test(name,()=>{const r=coordinationCase(kind);mutate(r.payload.facts);const f=r.payload.facts;if(f.public_coordination)f.public_coordination.basis=nationalBasis(f);if(f.care_periods)f.care_periods.basis=careBasis(f);assert.equal(processCase(r).total_additional,null);});
test('公費の入力順で優先順位を変えない',()=>{const r=coordinationCase('OVERLAP');r.payload.facts.public_coordination.grants.reverse();assert.equal(processCase(r).total_additional,27500);});
test('19歳の継続認定あり',()=>{const r=coordinationCase('CHILD'),f=r.payload.facts;f.qualification.members[1].age=19;f.public_coordination.grants[1].continued_before_18=true;f.public_coordination.basis=nationalBasis(f);assert.equal(processCase(r).total_additional,50010);});
test('医療扶助の未認定立替を分類',()=>{const r=coordinationCase('APPROVED-ADVANCE');delete r.payload.facts.public_coordination.welfare.reimbursement;const x=processCase(r);assert.equal(x.total_additional,null);assert.equal(x.findings[0].reason_category,'INDIVIDUAL_APPROVAL');});
test('年間公費は月額を照合しても未確認の年間式を適用しない',()=>{const r=processCase(coordinatedAnnualCase());assert.equal(r.total_additional,null);assert.equal(r.findings[0].reason_category,'SOURCE_UNCONFIRMED');assert.equal(r.annual_preparation.months.length,12);assert.equal(r.annual_preparation.patient_balance,119880);assert.equal(r.annual_preparation.public_monthly,600120);});
test('年間月別の認定改変を見逃さない',()=>{const r=coordinatedAnnualCase();r.payload.facts.annual.months[0].facts.statements[0].cash--;const x=processCase(r);assert.equal(x.total_additional,null);assert.equal(x.annual_preparation.status,'INCOMPLETE');});

test('月途中変更を日割りで推測しない',()=>{const r=coordinationCase('CERTIFICATE-CHANGE');delete r.payload.facts.public_coordination.grants[0].monthly_cap_decision;const x=processCase(r);assert.equal(x.total_additional,null);assert.equal(x.findings[0].reason_category,'INDIVIDUAL_APPROVAL');});
test('変更認定の異なる月を流用しない',()=>{const r=coordinationCase('CERTIFICATE-CHANGE');r.payload.facts.public_coordination.grants[0].monthly_cap_decision.month='2026-06';assert.equal(processCase(r).total_additional,null);});
