import {allocateMonthly,apportion} from './allocation.mjs';
import {evaluate} from './rules.mjs';
import {digest} from './store.mjs';
const source='https://www.mhlw.go.jp/web/t_doc?dataId=00tc4014&dataType=1';
const money=n=>Number.isSafeInteger(n)&&n>=0;
const fail=(detail,kind='MISSING_FACT',reason_category=kind==='RULE_GAP'?'IMPLEMENTATION_PENDING':'CASE_INFORMATION')=>({findings:[{id:'P30',kind,reason_category,detail,owner:'STAFF'}],proposal:null});
// Monthly allocation certificates are accepted only after reconciliation to the
// recalculated monthly benefit. They are never inferred from receipt order.
export function evaluateHouseholdAnnual(month,facts,period,asOf){
 const a=facts.annual,next=period.from>='2026-08';
 if(typeof asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString().slice(0,10)!==asOf)return fail('年間算定の判定日が不正です','INVALID_FACT');
 if(!a.complete||!Array.isArray(a.months)||a.months.length!==12||!money(a.prior_paid))return fail('家族年間台帳の12か月・既支給の確認が必要です');
 if(a.from!==period.from||a.through!==period.through||asOf<=period.through+'-31'||period.through>'2027-07')return fail('年間集計期間・終了日・適用版を確認してください');
 const expected=Array.from({length:12},(_,i)=>{const d=new Date(Date.UTC(Number(period.from.slice(0,4)),7+i,1));return d.toISOString().slice(0,7);});
 if(new Set(a.months.map(x=>x.month)).size!==12||expected.some(m=>!a.months.some(x=>x.month===m)))return fail('年間台帳の月が重複または欠落しています','INVALID_FACT');
 const identity=f=>digest({scheme:f.qualification?.scheme,insurer:f.qualification?.insurer,household:f.qualification?.household,members:f.qualification?.members?.map(m=>({id:m.id,senior:m.age>=70})),income:{young:f.income?.young,senior:f.income?.senior}});
 const people=new Map(facts.qualification.members.map(m=>[m.id,{person:m.id,age:m.age,retained:0,outpatient:0,insurers:{}}]));let retained=0;const trace=[];
 for(const item of a.months){const f=item.facts;
  if(!item.verified||!item.evidence||!f||!Array.isArray(f.statements)||!f.statements.length)return fail('月別の確認済み明細と証拠が必要です');
  if(next&&identity(f)!==identity(facts))return fail('2026年8月以降の年間世帯上限について、所得・保険変更時の区分選択・配分通知の確認が必要です','RULE_GAP','SOURCE_UNCONFIRMED');
  if(item.month===month&&digest(f.statements)!==digest(facts.statements))return fail('年間台帳と現在の明細が一致しません','INVALID_FACT');
  const end=new Date(Date.UTC(Number(item.month.slice(0,4)),Number(item.month.slice(5)),0)).toISOString().slice(0,10);
  if(['qualification','income'].some(k=>!f[k]?.from||!f[k]?.through||f[k].from>item.month+'-01'||f[k].through<end))return fail('月別の資格・所得の適用期間が不足しています');
  const result=evaluate({month:item.month},Object.fromEntries(Object.entries(f).map(([k,value])=>[k,{value,verified:true,evidence:item.evidence}])));
  if(result.findings.length)return fail(item.month+'の月額算定を解決してください：'+result.findings.map(x=>x.detail).join('／'));
  let allocations=item.allocations;if(a.ledger_mode==='AUTO_NOTIFICATION'){try{allocations=allocateMonthly(item.month,f,result.proposal);}catch(e){return fail(e.message,'RULE_GAP');}}
  if(!Array.isArray(allocations)||allocations.length!==f.statements.length||new Set(allocations.map(x=>x.statement_id)).size!==allocations.length)return fail('月額給付を個人・入院外来へ配分した確認済み台帳が必要です');
  let allocated=0;
  for(const s of f.statements){const v=allocations.find(x=>x.statement_id===s.id),p=people.get(s.person),member=f.qualification.members.find(x=>x.id===s.person);
   if(!p||!member||!v?.verified||!v.evidence||!money(v.monthly_entitlement)||v.monthly_entitlement>s.copay)return fail('月額給付配分の人物・証拠・金額が不整合です','INVALID_FACT');
   if(member.age<70&&s.copay<21000)return fail('21,000円未満の明細を含む年間算定は受診単位の確認が必要です','RULE_GAP');
   allocated+=v.monthly_entitlement;const net=s.copay-v.monthly_entitlement;retained+=net;p.retained+=net;
   if(member.age>=70&&s.setting==='outpatient'&&['general','low1','low2'].includes(f.income.senior)){p.outpatient+=net;p.insurers[f.qualification.insurer]=(p.insurers[f.qualification.insurer]||0)+net;}
  }
  if(allocated!==result.proposal.entitlement)return fail('個人別給付配分の合計が月額再計算額と一致しません','INVALID_FACT');
  trace.push({month:item.month,monthly_entitlement:allocated,allocations,evidence:item.evidence});
 }
 const q=facts.qualification,inc=facts.income,allSenior=q.members.every(m=>m.age>=70),allYoung=q.members.every(m=>m.age<70);
 if(next&&!allSenior&&!allYoung)return fail('年齢混在世帯の年間所得区分・配分を確認してください','RULE_GAP','SOURCE_UNCONFIRMED');
 const g=allSenior?inc.senior:inc.young;
 if(next&&['d','general'].includes(g)&&(typeof a.low_income_200_confirmed!=='boolean'||!a.low_income_200_evidence))return fail('41万円特例の認定所得証拠が必要です');
 const limit=next?({a:1680000,b:1110000,c:530000,d:530000,e:290000,general:530000,low1:180000,low2:290000}[g]):null;
 if(next&&!money(limit))return fail('年間算定の所得区分を確認してください');
 const cap=next&&['d','general'].includes(g)&&a.low_income_200_confirmed?410000:limit;
 let outpatient=0;const personal=[];
 for(const p of people.values()){
  const outcap=p.age>=70?(next?(inc.senior==='general'?216000:inc.senior==='low2'?96000:null):['general','low1','low2'].includes(inc.senior)?144000:null):null;
  const refund=outcap===null?0:Math.max(0,p.outpatient-outcap);outpatient+=refund;
  let insurerShares=null;if(!next&&facts.qualification.scheme==='EMPLOYEE'&&a.ledger_mode==='AUTO_NOTIFICATION'){try{const keys=Object.keys(p.insurers);const amounts=apportion(refund,keys.map(k=>p.insurers[k]));insurerShares=keys.map((insurer,i)=>({insurer,amount:amounts[i]}));}catch(e){return fail(e.message,'RULE_GAP');}}
  personal.push({...p,insurer_shares:insurerShares,outpatient_limit:outcap,outpatient_entitlement:refund,insurer_allocation_status:insurerShares?'CALCULATED':Object.keys(p.insurers).length>1?'CERTIFICATE_REQUIRED':'SINGLE_INSURER'});
 }
 const general=cap===null?0:Math.max(0,retained-outpatient-cap),entitlement=outpatient+general;
 if(a.prior_paid>entitlement)return fail('年間の既支給額が再計算額を超えています','INVALID_FACT');
 return {findings:[],proposal:{...period,entitlement,already_paid:a.prior_paid,additional:entitlement-a.prior_paid,outpatient_entitlement:outpatient,general_entitlement:general,general_limit:cap,retained_after_monthly:retained,personal,trace,not_before:cap===410000?'2027-08-01':null,sources:[source,next?'reform-4':'overview-4'],rule_version:'annual-household-2',requires_staff_approval:true,insurer_payment_allocation_pending:personal.some(p=>p.insurer_allocation_status==='CERTIFICATE_REQUIRED')}};
}
