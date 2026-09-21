import {evaluateCarePeriods} from './care-periods.mjs';
import {coordinatePublic} from './public-coordination.mjs';
import {selectPolicy} from './policy-registry.mjs';
import {evaluateWithSpecialists} from './specialist.mjs';
import {digest} from './store.mjs';
export const NATIONAL_VERSION='national-2.1';
export const NATIONAL_SOURCES={
 overseas:'https://www.kyoukaikenpo.or.jp/benefit/overseas_medical_expenses/',
 orthosis:'https://www.mhlw.go.jp/bunya/iryouhoken/iryouhoken13/01-03.html',
 public_aid:'https://www.mhlw.go.jp/web/t_doc?dataId=00tc3983&dataType=1&pageNo=1',
 third_party:'https://www.kyoukaikenpo.or.jp/benefit/accident/',
 work_injury:'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000154463.html'
};
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export const nationalBasis=f=>digest({qualification:f.qualification,income:f.income,statements:f.statements,prior_paid:f.prior_paid,history:f.history});
// Optional insurer rules are adapters, not assumed entitlements.
export const extensionContract={version:1,required:['scheme','insurer','from','through','verification_status','source','rounding','payment_unit'],enabled:false};
export function evaluateNational(scope,records){
 if(records.care_periods)return evaluateCarePeriods(scope,records,evaluateNational);
 const screen=records.exception_screen?.value;
 if(!screen||!records.exception_screen.verified)return evaluateWithSpecialists(scope,records);
 const relevant=['overseas','orthosis','public_aid','third_party','work_injury'].filter(k=>screen[k]);
 if(!relevant.length)return evaluateWithSpecialists(scope,records);
 const f=Object.fromEntries(Object.entries(records).map(([k,r])=>[k,r.value])),findings=[],components=[];
 const fail=(id,detail,kind='MISSING_FACT')=>findings.push({id,detail,kind,owner:'STAFF'});
 const review=(key,id)=>{const r=records[key],v=r?.value;if(!r?.verified||!r.evidence||!v||v.verified!==true||!v.evidence||v.basis!==nationalBasis(f)){fail(id,'現在の明細・資格・所得に紐づく確認済み'+key+'と証拠が必要です');return null;}return v;};
 if(scope.month<'2018-08'||scope.month>'2027-07')return {findings:[{id:'period',kind:'RULE_GAP',detail:'全国共通算定の対象期間外です',owner:'STAFF'}]};
 if(['qualification','income','statements','prior_paid','claim_timing'].some(k=>!records[k]?.verified||!records[k].evidence))return {findings:[{id:'verification',kind:'MISSING_FACT',detail:'資格・所得・明細・既支給・期限の確認済み証拠が必要です',owner:'STAFF'}]};
 if(!f.claim_timing?.within_deadline)return {findings:[{id:'claim_timing',kind:'MISSING_FACT',detail:'給付ごとの起算日・申請期限を確認してください',owner:'STAFF'}]};
 for(const id of [...(screen.overseas||screen.orthosis?['REIMBURSEMENT']:[]),...(screen.public_aid?['PUBLIC_AID']:[]),...(screen.third_party||screen.work_injury?['COORDINATION']:[])])if(!selectPolicy(id,scope.month))fail('period','検証済みの適用規程がありません：'+id,'RULE_GAP');
 if(findings.length)return {findings,components};
 if(f.public_coordination)return coordinatePublic(scope,records,nationalBasis(f),evaluateWithSpecialists);
 const next=structuredClone(records);let rows=structuredClone(f.statements);
 if(!Array.isArray(rows)||!rows.length||new Set(rows.map(s=>s.id)).size!==rows.length)return {findings:[{id:'statements',kind:'INVALID_FACT',detail:'明細の重複・欠落を確認してください',owner:'STAFF'}]};
 if(screen.work_injury){
  const c=review('labor_review','P26');
  if(c){
   if(c.decision==='NOT_WORK_RELATED'&&c.health_coverage_confirmed===true)next.exception_screen.value.work_injury=false;
   else if(c.decision==='RECOGNIZED'&&c.scope_complete===true&&relevant.length===1&&Object.entries(screen).every(([k,v])=>!v||k==='work_injury')){
    // Recognized labor benefits follow the labor authority's valuation. Health
    // insurance repayment and direct insurer adjustment are not citizen refunds.
    if(!money(c.recognized_cost)||!money(c.citizen_paid_eligible)||!money(c.already_paid)||c.already_paid>c.citizen_paid_eligible||c.citizen_paid_eligible>c.recognized_cost||!money(c.health_insurer_recovery)||!c.settlement_route||c.recognized_cost!==c.citizen_paid_eligible+c.health_insurer_recovery||f.prior_paid!==0)fail('P26','労災認定額、本人支払、健康保険返還、既払の対応が不整合です','INVALID_FACT');
    else {components.push({kind:'LABOR',label:'労災療養費（認定額に基づく）',entitlement:c.citizen_paid_eligible,already_paid:c.already_paid,additional:c.citizen_paid_eligible-c.already_paid,insurer_recovery:c.health_insurer_recovery,settlement_route:c.settlement_route,source:NATIONAL_SOURCES.work_injury});return {findings:[],components,tool:'LABOR_RECOGNIZED',proposal:null,health_insurance_not_applicable:true};}
   }else fail('P26','労災認定・対象費用・制度切替の確認が必要です。未認定を健康保険の不支給とは扱いません');
  }
 }
 if(screen.overseas||screen.orthosis){
  if(screen.overseas&&f.qualification.scheme!=='EMPLOYEE')fail('P27','この海外療養費版は被用者保険の認定済み費用を対象とします。他制度の換算・算定規程を確認してください','RULE_GAP');
  const c=review('reimbursement_review',screen.overseas?'P27':'P28');
  if(c){
   if(!Array.isArray(c.items)||!c.items.length||new Set(c.items.map(x=>x.statement_id)).size!==c.items.length)fail('P27','療養費認定明細の重複・不足を確認してください');
   else {
    const used=new Set();
    for(const x of c.items){const s=rows.find(s=>s.id===x.statement_id),id=x.kind==='OVERSEAS'?'P27':'P28';
     if(!s||!['OVERSEAS','ORTHOSIS'].includes(x.kind)||s.kind!==x.kind||!screen[x.kind==='OVERSEAS'?'overseas':'orthosis']){fail(id,'療養費認定と明細種別が一致しません','INVALID_FACT');continue;}
     used.add(s.id);
     if(x.eligible!==true||!x.evidence||!date(x.recognition_date)||!date(x.paid_on)||!date(x.deadline_start)||!date(x.deadline_end)||x.deadline_start>x.deadline_end||f.claim_timing.received_on<x.deadline_start||f.claim_timing.received_on>x.deadline_end||!x.deadline_basis||x.calculation_month!==scope.month||!x.month_basis||!money(x.recognized_cost)||!money(x.already_paid)||!money(x.patient_share)||x.patient_share>x.recognized_cost){fail(id,'認定額・自己負担相当額・算定月・給付固有の申請期限を確認してください');continue;}
     let base=x.recognized_cost;
     if(x.kind==='OVERSEAS'){
      if(x.covered_in_japan!==true||x.travel_for_treatment!==false||!money(x.domestic_equivalent)||!money(x.actual_yen)||!x.currency||!date(x.conversion_date)||x.conversion_date!==x.recognition_date||!x.exchange_evidence||x.recognized_cost!==Math.min(x.domestic_equivalent,x.actual_yen)){fail(id,'国内相当額・円換算実費・決定日の換算証拠・渡航目的を確認してください');continue;}
     }else if(x.medical_necessity_confirmed!==true||!money(x.eligible_purchase_cost)||base>x.eligible_purchase_cost){fail(id,'装具の医師の必要性認定と対象購入費用を確認してください');continue;}
     if(![10,20,30].includes(x.patient_percent)||Math.abs(x.patient_share-base*x.patient_percent/100)>=1||!x.share_basis){fail(id,'認定自己負担割合と自己負担相当額・端数処理の根拠を確認してください');continue;}
     const entitlement=base-x.patient_share;
     if(x.already_paid>entitlement||!money(s.cash)||s.cash<base||s.in_kind!==0){fail(id,'療養費の支払額・既支給額・現物給付が不整合です','INVALID_FACT');continue;}
     components.push({kind:x.kind,label:x.kind==='OVERSEAS'?'海外療養費本体':'装具療養費本体',statement_id:s.id,recognized_cost:base,entitlement,already_paid:x.already_paid,additional:entitlement-x.already_paid,patient_share:x.patient_share,deadline_start:x.deadline_start,deadline_end:x.deadline_end,source:NATIONAL_SOURCES[x.kind==='OVERSEAS'?'overseas':'orthosis']});
     Object.assign(s,{total:base,copay:x.patient_share,cash:x.patient_share,in_kind:0,final:true});
    }
    if(rows.some(s=>['OVERSEAS','ORTHOSIS'].includes(s.kind)&&!used.has(s.id)))fail('P27','認定額に対応していない療養費明細があります');
    for(const k of ['overseas','orthosis'])if(screen[k]&&!c.items.some(x=>x.kind===(k==='overseas'?'OVERSEAS':'ORTHOSIS')))fail(k==='overseas'?'P27':'P28','該当フラグに対応する認定明細がありません');
    next.exception_screen.value.overseas=false;next.exception_screen.value.orthosis=false;
   }
  }
 }
 let third=null,aid=null,aidRows=null;
 if(screen.third_party){third=review('third_party_review','P25');if(third){if(third.eligibility_confirmed!==true||third.disputed!==false||!money(third.same_cause_compensation)||!money(third.benefit_offset)||third.benefit_offset>third.same_cause_compensation||!third.offset_basis)fail('P25','賠償の同一事由・給付調整額・求償担当の認定根拠を確認してください');else next.exception_screen.value.third_party=false;}}
 if(screen.public_aid){aid=review('public_aid_review','P21');if(aid){
  aidRows=rows;
  if(aid.all_treatment_eligible!==true){const coverage=aid.coverage;if(aid.scope_complete!==true||!Array.isArray(coverage)||coverage.length!==rows.length||new Set(coverage.map(c=>c.statement_id)).size!==rows.length||rows.some(s=>!coverage.some(c=>c.statement_id===s.id&&typeof c.eligible==='boolean'&&c.evidence)))fail('P21','対象診療と対象外診療の明細別確認記録が必要です');else aidRows=rows.filter(s=>coverage.find(c=>c.statement_id===s.id).eligible);if(!aidRows.length)fail('P21','公費対象として確認された明細がありません');}

  if(!['NANBYO','PSYCHIATRIC_OUTPATIENT'].includes(aid.program))fail('P21','この版の公費は指定難病・精神通院のみです','RULE_GAP');
  else if(relevant.length!==1||!date(aid.from)||!date(aid.through)||aidRows.some(s=>s.date<aid.from||s.date>aid.through||s.person!==aid.person||!aid.providers?.includes(s.provider)||(aid.program==='PSYCHIATRIC_OUTPATIENT'&&s.setting!=='outpatient'))||!(money(aid.monthly_limit)||(aid.monthly_limit===null&&aid.program==='PSYCHIATRIC_OUTPATIENT'&&['middle1','middle2'].includes(aid.income_class)&&aid.severe_continuing===false))||!money(aid.in_kind)||!money(aid.already_paid)||!aid.certificate||!aid.limit_basis)fail('P21','公費認定証・指定医療機関・対象診療・認定上限を確認してください。非対象診療との合算は別途確認します');
  else if(aid.program==='PSYCHIATRIC_OUTPATIENT'&&aid.income_class==='high'&&scope.month>'2027-03')fail('P21','精神通院の一定所得以上の経過特例は2027年3月末まで。延長根拠を確認してください','RULE_GAP');
  else if(scope.month<'2025-04')fail('P21','この公費算定版は2025年4月以降の確認資料を対象とします','RULE_GAP');
  else {
   let limit;
   if(aid.program==='NANBYO')limit=aid.ventilator===true?1000:({low1:2500,low2:5000,general1:aid.high_long===true?5000:10000,general2:aid.high_long===true?10000:20000,high:aid.high_long===true?20000:30000}[aid.income_class]);
   else limit=({low1:2500,low2:5000,middle1:aid.severe_continuing===true?5000:aid.severe_continuing===false?null:undefined,middle2:aid.severe_continuing===true?10000:aid.severe_continuing===false?null:undefined,high:aid.severe_continuing===true?20000:undefined}[aid.income_class]);
   if(limit===undefined||limit!==aid.monthly_limit)fail('P21','認定所得区分・高額長期等の特例と認定上限額が一致しません。上限なし区分・生活保護・世帯内複数受給は別途確認します');
   else {
    if(aid.in_kind>0){
     const allocations=aid.in_kind_allocations;
     if(!Array.isArray(allocations)||allocations.length!==rows.length||new Set(allocations.map(x=>x.statement_id)).size!==rows.length||allocations.reduce((n,x)=>n+(money(x.amount)?x.amount:NaN),0)!==aid.in_kind)fail('P21','公費現物給付の明細別配分と証拠が必要です');
     else for(const s of rows){const x=allocations.find(x=>x.statement_id===s.id);if(!x||!x.evidence||s.copay!==s.cash+s.in_kind+x.amount)fail('P21','実徴収額・保険現物給付・公費現物給付の合計が一部負担額と一致しません','INVALID_FACT');else s.cash+=x.amount;}
    }
    next.exception_screen.value.public_aid=false;
   }
  }
 }}
 if(findings.length)return {findings,components,tool:'NATIONAL_COORDINATION'};
 next.statements.value=rows;
 const evaluated=evaluateWithSpecialists(scope,next);
 if(evaluated.findings.length)return {...evaluated,components};
 const monthly=evaluated.proposal;
 if(third){if(third.benefit_offset>monthly.additional)fail('P25','給付に対応する賠償控除額が今回の追加給付を超えます。既給付との調整を確認してください','INVALID_FACT');else {monthly.before_compensation=monthly.additional;monthly.compensation_offset=third.benefit_offset;monthly.additional-=third.benefit_offset;monthly.sources.push(NATIONAL_SOURCES.third_party);monthly.trace.push({step:'THIRD_PARTY_OFFSET',amount:third.benefit_offset,evidence:third.evidence,recovery_separate:true});}}
 if(aid){
  const sum=k=>aidRows.reduce((n,s)=>n+s[k],0);let allocated=monthly.entitlement;
  if(aidRows.length!==rows.length){
   if(monthly.entitlement===0)allocated=0;
   else {const allocations=aid.insurance_allocations;if(!Array.isArray(allocations)||allocations.length!==rows.length||new Set(allocations.map(a=>a.statement_id)).size!==rows.length||rows.some(s=>!allocations.some(a=>a.statement_id===s.id&&a.verified===true&&a.evidence&&money(a.amount)&&a.amount<=s.copay))||allocations.reduce((n,a)=>n+a.amount,0)!==monthly.entitlement)fail('P21','対象・対象外診療へ配分した保険給付の確認が必要です');else allocated=allocations.filter(a=>aidRows.some(s=>s.id===a.statement_id)).reduce((n,a)=>n+a.amount,0);}
  }
  const remaining=sum('copay')-allocated,rate=aid.program==='NANBYO'?0.2:0.1;
  // Certified integer share avoids inventing an administrative rounding rule.
  if(!money(aid.rate_share)||Math.abs(aid.rate_share-sum('total')*rate)>=1)fail('P21','公費負担割合に対応する認定自己負担額と端数処理を確認してください');
  else {const patient=Math.min(remaining,aid.rate_share,aid.monthly_limit??Infinity),entitlement=remaining-patient,additional=entitlement-aid.in_kind-aid.already_paid;
   if(additional<0)fail('P21','公費の現物給付・既支給が認定軽減額を超えています','INVALID_FACT');
   else if(!findings.length)components.push({kind:'PUBLIC_AID',label:aid.program==='NANBYO'?'指定難病の公費軽減':'精神通院の公費軽減',entitlement,in_kind:aid.in_kind,already_paid:aid.already_paid,additional,patient_liability:patient,source:NATIONAL_SOURCES.public_aid});
  }
 }
 return {findings,components,proposal:monthly,tool:'NATIONAL_COORDINATION',normalized_statements:rows};
}
