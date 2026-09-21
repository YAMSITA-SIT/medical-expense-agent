import {selectPolicy} from './policy-registry.mjs';
import {age75Persons,AGE75_SOURCE} from './age75.mjs';
import {calculateSpecialDisease} from './disease.mjs';
import {SCREEN} from './catalog.mjs';
export const RULE_VERSION='monthly-0.4';
const serial=m=>Number(m.slice(0,4))*12+Number(m.slice(5));
const money=x=>Number.isSafeInteger(x)&&x>=0&&x<=100000000;
const sum=(rows,k)=>rows.reduce((s,r)=>s+r[k],0);
const tables={old:{a:[252600,842000,140100],b:[167400,558000,93000],c:[80100,267000,44400],d:[57600,0,44400],e:[35400,0,24600]},new:{a:[270300,901000,140100],b:[179100,597000,93000],c:[85800,286000,44400],d:[61500,0,44400],e:[36900,0,24600]}};
const cap=(table,group,total,multiple)=>{const [base,threshold,repeated]=table[group];return multiple?repeated:base+Math.floor((Math.max(0,total-(threshold||total))+50)/100);};
export function evaluate(scope,records){
 const findings=[],values={},add=(id,kind,detail,owner='STAFF')=>findings.push({id,kind,detail,owner});
 for(const name of ['qualification','income','statements','history','exception_screen','prior_paid','claim_timing']){
  const r=records[name];if(r?.verified!==true||!r.evidence)add(name,'MISSING_FACT',`${name}の確認済み資料が不足`,name==='statements'?'CITIZEN':'STAFF');else values[name]=r.value;
 }
 if(findings.length)return {findings};
 const {qualification:q,income,statements,history,exception_screen:screen,prior_paid:paid,claim_timing:timing}=values;
 if(!['KOKUHO','LATE_ELDER','EMPLOYEE','MUTUAL'].includes(q?.scheme))add('insurance','RULE_GAP','この版では該当する保険制度の専用ルールが未実装');
 if(!Array.isArray(q?.members)||!q.members.length||q.members.some(m=>!m||!m.id||!Number.isInteger(m.age)||m.age<0||m.age>120||(q.scheme!=='LATE_ELDER'?m.age>=75:m.age<75)||m.insurer!==q.insurer||m.household!==q.household||m.eligible!==true)||new Set(q.members.map(m=>m.id)).size!==q.members.length)add('qualification','INVALID_FACT','同一保険世帯・加入資格・適用年齢を確認');
 if(['EMPLOYEE','MUTUAL'].includes(q?.scheme)){
  if(!q.subscriber_id||!q.members.some(m=>m.id===q.subscriber_id&&m.role==='INSURED')||q.members.some(m=>m.subscriber_id!==q.subscriber_id||!['INSURED','DEPENDENT'].includes(m.role)||(m.role==='INSURED'&&m.id!==q.subscriber_id))||income?.basis!=='CERTIFIED_INSURER_CLASSIFICATION'||!income.certificate)add('qualification','MISSING_FACT','被保険者・被扶養者の保険世帯と保険者認定所得区分の証拠が必要です');
 }
 for(const [key,pattern] of Object.entries(SCREEN))if(typeof screen?.[key]!=='boolean')add(key,'MISSING_FACT',`${pattern}の該当有無が未確認`);else if(screen[key]&&!['age75_transition','special_disease'].includes(key))add(pattern,'RULE_GAP',`${key}の専門処理が必要`);
 if(timing?.within_deadline!==true||!timing?.basis||!timing?.received_on)add('claim_timing','MISSING_FACT','申請受付日と時効の起算・適用根拠を確認。自動不支給にはしない');
 if(!money(paid))add('prior_paid','INVALID_FACT','同月の既支給額を確認');
 const next=scope.month>='2026-08',table=next?tables.new:tables.old;
 if(!selectPolicy('MONTHLY',scope.month))add('period','RULE_GAP','適用時点の算式が未登録');
 if(!Array.isArray(statements)||!statements.length)add('statements','MISSING_FACT','診療明細・領収情報が不足','CITIZEN');
 if(findings.length)return {findings};
 const units=new Map(),ids=new Set();
 for(const row of statements){
  if(!row||ids.has(row.id)||!row.id||typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||new Date(row.date).toISOString().slice(0,10)!==row.date||row.date.slice(0,7)!==scope.month||!['total','copay','cash','in_kind','excluded'].every(k=>money(row[k]))||row.copay>row.total||row.copay!==row.cash+row.in_kind||row.final!==true||!row.provider||!['medical','dental','pharmacy'].includes(row.category)||!['inpatient','outpatient'].includes(row.setting)){
   add('statements','INVALID_FACT','明細の重複・年月・確定状態・支払内訳を照合');continue;
  }
  ids.add(row.id);const member=q.members.find(m=>m.id===row.person);
  if(!member){add('qualification','INVALID_FACT','受診者が対象世帯にいない');continue;}
  const pharmacy=row.category==='pharmacy';
  if(pharmacy&&(!row.prescriber||!['medical','dental'].includes(row.prescription_category)||row.setting!=='outpatient')){add('P18','MISSING_FACT','処方元医療機関と医科・歯科区分を確認');continue;}
  const key=JSON.stringify([row.person,pharmacy?row.prescriber:row.provider,pharmacy?row.prescription_category:row.category,row.setting]);
  const unit=units.get(key)||{key,provider:pharmacy?row.prescriber:row.provider,category:pharmacy?row.prescription_category:row.category,person:row.person,age:member.age,setting:row.setting,total:0,copay:0,cash:0,in_kind:0,ids:[]};
  for(const k of ['total','copay','cash','in_kind'])unit[k]+=row[k];unit.ids.push(row.id);units.set(key,unit);
 }
 const seen=new Set();
 if(history?.complete!==true||!Array.isArray(history?.records))add('history','MISSING_FACT','対象月前11か月の支給・現物給付履歴が不足');
 else for(const h of history.records){
  if(!h||!/^\d{4}-(0[1-9]|1[0-2])$/.test(h.month)||!['MONTHLY','OUTPATIENT_ONLY','SPECIAL_ONLY','ANNUAL','CANCELLED'].includes(h.kind)||!h.evidence||typeof h.continuous!=='boolean'||!money(h.amount)){add('history','INVALID_FACT','履歴の給付種別・継続性・証拠を確認');continue;}
  if(h.kind==='MONTHLY'&&h.continuous&&h.amount>0&&serial(scope.month)-serial(h.month)>=1&&serial(scope.month)-serial(h.month)<=11)seen.add(h.month);
 }
 if(findings.length)return {findings};
 const all=[...units.values()],multiple=seen.size>=3;let transitions=new Set(),special=null;
 if(screen.age75_transition){const result=age75Persons(scope.month,q,statements,records.age75);if(result.findings.length)findings.push(...result.findings);else transitions=result.people;}
 if(screen.special_disease){if(q.scheme!=='KOKUHO'||screen.age75_transition)add('P24','RULE_GAP','特定疾病と後期高齢者・75歳移行の組合せは別途確認が必要です');else if(records.special_units?.verified!==true||!records.special_units.evidence)add('P24','MISSING_FACT','特定疾病の認定証・対象明細・適用期間が不足しています');else{special=calculateSpecialDisease(all.map(u=>({...u,person_id:u.person,paid:u.cash})),statements.map(r=>({...r,person_id:r.person,paid:r.cash,prescription_provider_id:r.prescriber})),{special_units:records.special_units.value,under70_group:income.young});if(!special.resolved)add('P24','MISSING_FACT',special.errors.join('／'));}}
 const residuals=new Map((special?.resolved?special.details:[]).map(d=>[d.unit,d.retained]));
 const reduced=all.map(u=>({...u,copay:residuals.has(u.key)?residuals.get(u.key):u.copay,original_copay:u.copay}));
 const young=reduced.filter(u=>u.age<70&&u.original_copay>=21000),senior=reduced.filter(u=>u.age>=70);
 if(young.length&&!Object.hasOwn(table,income?.young))add('P32','MISSING_FACT','70歳未満の認定所得区分が不足');
 if(senior.length&&!['a','b','c','general','low1','low2'].includes(income?.senior))add('P32','MISSING_FACT','70歳以上の認定所得区分が不足');
 if(findings.length)return {findings};
 const trace=(special?.resolved?special.details:[]).map(d=>({step:'SPECIAL_DISEASE',...d}));let seniorRefund=0;
 if(senior.length){
  const g=income.senior;const outCap=['a','b','c'].includes(g)?null:g==='general'?(next?22000:18000):g==='low2'?(next?11000:8000):8000;
  const houseCap=['a','b','c'].includes(g)?cap(table,g,sum(senior,'total'),multiple):g==='general'?(multiple?44400:next?61500:57600):g==='low2'?(next?(multiple?24600:25700):24600):(next?15700:15000);
  for(const person of new Set(senior.map(u=>u.person))){const rows=senior.filter(u=>u.person===person),base=sum(rows.filter(u=>u.setting==='outpatient'),'copay'),half=transitions.has(person),limit=outCap===null?null:outCap/(half?2:1),refund=limit===null?0:Math.max(0,base-limit);seniorRefund+=refund;trace.push({step:'SENIOR_OUTPATIENT',person,base,limit,refund});if(half){const personalBase=sum(rows,'copay')-refund;let personalLimit;if(['a','b','c'].includes(g)){const [b,t,r]=table[g];personalLimit=multiple?r/2:b/2+Math.floor((Math.max(0,sum(rows,'total')-t/2)+50)/100);}else personalLimit=houseCap/2;const extra=Math.max(0,personalBase-personalLimit);seniorRefund+=extra;trace.push({step:'AGE75_PERSONAL',person,base:personalBase,limit:personalLimit,refund:extra,source:AGE75_SOURCE});}}
  const base=sum(senior,'copay')-seniorRefund,refund=Math.max(0,base-houseCap);seniorRefund+=refund;trace.push({step:'SENIOR_HOUSEHOLD',base,limit:houseCap,refund});
 }
 let householdRefund=0;
 if(young.length){const base=sum(young,'copay')+sum(senior,'copay')-seniorRefund,limit=cap(table,income.young,sum(young,'total')+sum(senior,'total'),multiple);householdRefund=Math.max(0,base-limit);trace.push({step:'HOUSEHOLD',base,limit,refund:householdRefund});}
 const entitlement=(special?.resolved?special.entitlement:0)+seniorRefund+householdRefund,inKind=sum(all,'in_kind'),cash=sum(all,'cash'),refund=entitlement-inKind;
 if(refund<0||refund>cash||paid>refund)return {findings:[{id:'settlement',kind:'INVALID_FACT',detail:'現物給付・既支給額と再計算額の調整が必要',owner:'STAFF'}]};
 return {findings:[],tool:screen.special_disease?'SPECIAL_DISEASE_WITH_HOUSEHOLD':screen.age75_transition?'AGE75_WITH_HOUSEHOLD':'STANDARD_MONTHLY',proposal:{scope:'MONTHLY_ONLY',entitlement,in_kind:inKind,already_paid:paid,additional:refund-paid,multiple,history_months:[...seen].sort(),trace,rule_version:RULE_VERSION,sources:[next?'reform':'guide',...(screen.age75_transition?[AGE75_SOURCE]:[]),...(special?.resolved?[special.source]:[])],requires_staff_approval:true,annual_status:next?'SEPARATE_RULE_PENDING':'SEPARATE_CHECK_REQUIRED'}};
}
