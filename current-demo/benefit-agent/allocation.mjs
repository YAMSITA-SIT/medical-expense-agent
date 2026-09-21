export const ALLOCATION_SOURCE='https://www.mhlw.go.jp/web/t_doc?dataId=00tc3997&dataType=1&pageNo=1';
// Notification 2(3): truncate others, give residual to the smallest share.
export function apportion(amount,weights){
 if(!Number.isSafeInteger(amount)||amount<0||weights.some(w=>!Number.isSafeInteger(w)||w<0))throw Error('配分額が不正です');
 const total=weights.reduce((n,w)=>n+w,0);if(amount>total)throw Error('給付額が配分対象額を超えます');
 if(!total)return weights.map(()=>0);
 const out=weights.map(w=>Number(BigInt(amount)*BigInt(w)/BigInt(total))),remainder=amount-out.reduce((a,b)=>a+b,0);
 const positive=weights.map((w,i)=>({w,i})).filter(x=>x.w>0).sort((a,b)=>a.w-b.w||a.i-b.i);
 if(remainder&&positive.length>1&&positive[0].w===positive[1].w)throw Error('最小配分額が同額のため保険者の端数配分方針を確認してください');
 if(remainder)out[positive[0].i]+=remainder;
 return out;
}
export function allocateMonthly(month,facts,proposal){
 if(month>'2026-07'||facts.qualification.scheme!=='EMPLOYEE'||facts.qualification.members.some(m=>m.age<70)||Object.values(facts.exception_screen).some(Boolean))throw Error('自動配分は2026年7月までの被用者保険・70歳以上の通常世帯が対象です');
 const rows=facts.statements,people=[...new Set(rows.map(s=>s.person))].sort();
 if(new Set(rows.map(s=>s.person+'|'+s.setting)).size!==rows.length)throw Error('個人・入院外来別の月額集約明細が必要です');
 const groups=people.map(person=>{const out=rows.find(s=>s.person===person&&s.setting==='outpatient'),inside=rows.find(s=>s.person===person&&s.setting==='inpatient'),refund=proposal.trace.find(t=>t.step==='SENIOR_OUTPATIENT'&&t.person===person)?.refund||0;return {person,out,inside,refund,outNet:(out?.copay||0)-refund,inNet:inside?.copay||0};});
 const house=proposal.trace.find(t=>t.step==='SENIOR_HOUSEHOLD')?.refund||0,shares=apportion(house,groups.map(g=>g.outNet+g.inNet));
 const allocations=[];
 for(const [i,g] of groups.entries()){const total=g.outNet+g.inNet,ex=total?Number(BigInt(shares[i])*BigInt(g.outNet)/BigInt(total)):0,inc=shares[i]-ex;
  if(g.out)allocations.push({statement_id:g.out.id,monthly_entitlement:g.refund+ex,verified:true,evidence:ALLOCATION_SOURCE,method:'AUTO_NOTIFICATION_2_3'});
  if(g.inside)allocations.push({statement_id:g.inside.id,monthly_entitlement:inc,verified:true,evidence:ALLOCATION_SOURCE,method:'AUTO_NOTIFICATION_2_3'});
 }
 if(allocations.reduce((n,a)=>n+a.monthly_entitlement,0)!==proposal.entitlement)throw Error('月額給付と自動配分の総額が一致しません');
 return allocations;
}
