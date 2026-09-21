import {basicLedger} from './decision-output.mjs';
import {digest} from './store.mjs';
const fail=(detail,kind='MISSING_FACT')=>({findings:[{id:'CARE_PERIODS',kind,detail,owner:'STAFF'}],components:[]});
export const careBasis=f=>digest({statements:f.statements,qualification:f.qualification,income:f.income,history:f.history,prior_paid:f.prior_paid});
export function evaluateCarePeriods(scope,records,evaluate){
 const f=Object.fromEntries(Object.entries(records).map(([k,r])=>[k,r.value])),v=records.care_periods,c=v?.value;
 if(!v?.verified||!v.evidence||!c?.verified||!c.evidence||c.basis!==careBasis(f)||!c.protection_decision||!/^\d{4}-\d{2}-\d{2}$/.test(c.protection_start||'')||!Number.isFinite(Date.parse(c.protection_start))||new Date(c.protection_start).toISOString().slice(0,10)!==c.protection_start||!c.protection_start.startsWith(scope.month)||!Array.isArray(c.periods)||c.periods.length!==2)return fail('保護開始決定・開始日と切替前後の確認済み資格が必要です');
 const periods=[...c.periods].sort((a,b)=>(a.facts?.qualification?.from||'').localeCompare(b.facts?.qualification?.from||'')),used=new Set(),evaluated=[];
 const expectedBefore=new Date(Date.parse(c.protection_start)-86400000).toISOString().slice(0,10);
 if(!['KOKUHO','LATE_ELDER'].includes(periods[0].facts?.qualification?.scheme)||periods[1].facts?.qualification?.scheme!=='MEDICAL_ASSISTANCE'||periods[0].facts.qualification.through!==expectedBefore||periods[1].facts.qualification.from!==c.protection_start)return fail('保護開始日・旧資格最終日・医療扶助開始日の対応が不整合です','INVALID_FACT');
 for(const p of periods){
  if(!p.verified||!p.evidence||!p.facts||!Array.isArray(p.facts.statements)||!p.facts.statements.length)return fail('切替前後の確認済み明細・資格・所得・認定が必要です');
  for(const s of p.facts.statements){const original=f.statements.find(x=>x.id===s.id);if(!original||used.has(s.id)||digest(original)!==digest(s)||s.date<p.facts.qualification.from||s.date>p.facts.qualification.through||!p.facts.income?.from||!p.facts.income?.through||s.date<p.facts.income.from||s.date>p.facts.income.through)return fail('切替前後の明細割当・診療日・原本が不整合です','INVALID_FACT');used.add(s.id);}
  if(p.facts.care_periods)return fail('資格切替の入れ子は認めません','INVALID_FACT');
  const result=evaluate(scope,Object.fromEntries(Object.entries(p.facts).map(([k,value])=>[k,{value,verified:true,evidence:p.evidence}])));
  if(result.findings.length)return {...result,findings:result.findings.map(x=>({...x,period:p.id}))};evaluated.push({id:p.id,...result,calculation_ledger:basicLedger(p.facts,result)});
 }
 if(used.size!==f.statements.length||periods.reduce((n,p)=>n+p.facts.prior_paid,0)!==f.prior_paid)return fail('未割当明細または既支給の重複・不一致があります','INVALID_FACT');
 const health=evaluated.filter(x=>x.proposal),sum=k=>health.reduce((n,x)=>n+x.proposal[k],0);
 return {findings:[],tool:'PROTECTION_TRANSITION',proposal:health.length?{entitlement:sum('entitlement'),additional:sum('additional'),in_kind:sum('in_kind'),already_paid:sum('already_paid'),trace:health.flatMap(x=>x.proposal.trace),sources:[...new Set(health.flatMap(x=>x.proposal.sources||[]))]}:null,components:evaluated.flatMap(x=>x.components||[]),calculation_ledger:evaluated.flatMap(x=>x.calculation_ledger||[]),coordination_trace:[{step:'PROTECTION_TRANSITION',start:c.protection_start,decision:c.protection_decision,periods:periods.map(p=>({id:p.id,from:p.facts.qualification.from,through:p.facts.qualification.through,scheme:p.facts.qualification.scheme}))}]};
}
