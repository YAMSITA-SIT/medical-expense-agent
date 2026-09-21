import {programPriority} from './public-priority.mjs';
import {selectPolicy} from './policy-registry.mjs';
// Certified monthly coordination. Receipt amounts alone cannot establish an award.
export const PUBLIC_VERSION='public-coordination-2';
export const PUBLIC_SOURCES={cash:'https://www.mhlw.go.jp/web/t_doc?dataId=82048000',child:'https://www.mhlw.go.jp/web/t_doc?dataId=82061000',priority:'https://www.ssk.or.jp/seikyushiharai/iryokikan/download/index.files/checklogic_ika.pdf',nanbyo:'https://www.mhlw.go.jp/web/t_doc?dataId=80ab4324&dataType=0&pageNo=1',welfare:'https://www.mhlw.go.jp/web/t_doc?dataId=00ta8434&dataType=1',psych:'https://www.mhlw.go.jp/content/001446684.pdf'};
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const fail=(detail,kind='MISSING_FACT')=>({findings:[{id:'P21',kind,detail,owner:'STAFF'}],components:[]});
export function familyCaps(members){
 if(!Array.isArray(members)||!members.length||new Set(members.map(m=>m.id)).size!==members.length||members.some(m=>!m.id||!money(m.base_limit)))throw Error('受給者・配分前上限が不正です');
 const sum=members.reduce((n,m)=>n+m.base_limit,0),max=Math.max(...members.map(m=>m.base_limit));
 return Object.fromEntries(members.map(m=>[m.id,sum?Number(BigInt(m.base_limit)*BigInt(max)/(BigInt(sum)*10n))*10:0]));
}
export function baseCap(a,month){
 if(a.program==='CHILD_CHRONIC')return a.ventilator===true?500:({low1:1250,low2:2500,general1:a.severe===true?2500:5000,general2:a.severe===true?5000:10000,high:a.severe===true?10000:15000})[a.income_class];
 if(a.program==='NANBYO')return a.ventilator===true?1000:({low1:2500,low2:5000,general1:a.high_long===true?5000:10000,general2:a.high_long===true?10000:20000,high:a.high_long===true?20000:30000})[a.income_class];
 if(a.program==='PSYCHIATRIC_OUTPATIENT')return ({low1:2500,low2:5000,middle1:a.severe_continuing===true?5000:a.severe_continuing===false?null:undefined,middle2:a.severe_continuing===true?10000:a.severe_continuing===false?null:undefined,high:month<='2027-03'&&a.severe_continuing===true?20000:undefined})[a.income_class];
}
export function coordinatePublic(scope,records,basis,evaluate){
 const f=Object.fromEntries(Object.entries(records).map(([k,r])=>[k,r.value])),r=records.public_coordination,c=r?.value;let rows=f.statements;
 if(!r?.verified||!r.evidence||!c?.verified||!c.evidence||c.basis!==basis||c.scope_complete!==true)return fail('公費調整の認定記録・対象明細全体・現在の資格との対応を確認してください');
 if(c.service_lines){
  if(!Array.isArray(c.service_lines)||!c.service_lines.length||new Set(c.service_lines.map(l=>l.id)).size!==c.service_lines.length)return fail('診療内訳の重複・欠落があります','INVALID_FACT');
  const original=rows,expanded=[];
  for(const line of c.service_lines){const parent=original.find(s=>s.id===line.statement_id);if(!parent||!line.id||line.verified!==true||!line.evidence||!['total','copay','cash','in_kind','excluded'].every(k=>money(line[k])))return fail('公費対象診療の内訳・確認済み証拠が必要です');expanded.push({...parent,...Object.fromEntries(['total','copay','cash','in_kind','excluded'].map(k=>[k,line[k]])),id:line.id,parent_statement:parent.id,points:line.total/10});}
  for(const parent of original)if(['total','copay','cash','in_kind','excluded'].some(k=>expanded.filter(s=>s.parent_statement===parent.id).reduce((n,s)=>n+s[k],0)!==parent[k]))return fail('診療内訳と元の明細合計が一致しません','INVALID_FACT');
  rows=expanded;f.statements=rows;records=structuredClone(records);records.statements.value=rows;
  if(records.special_units)records.special_units.value=records.special_units.value.map(u=>({...u,statement_ids:u.statement_ids.flatMap(id=>rows.filter(s=>s.parent_statement===id).map(s=>s.id))}));
  if(records.settlement_units)records.settlement_units.value=records.settlement_units.value.map(u=>({...u,statement_ids:u.statement_ids.flatMap(id=>rows.filter(s=>s.parent_statement===id).map(s=>s.id))}));
 }
 if(!selectPolicy('PUBLIC_COORDINATION',scope.month))return fail('公費調整版の対象期間外です','RULE_GAP');
 if(Object.entries(f.exception_screen).some(([k,v])=>v&&!['public_aid','special_disease','age75_transition','different_insurance','insurance_change','relocation'].includes(k)))return fail('他の専門算定・資格分割との公費調整には追加の算定規程が必要です','RULE_GAP');
 if(!Array.isArray(rows)||!rows.length||new Set(rows.map(s=>s.id)).size!==rows.length||rows.some(s=>!validDate(s.date)||!s.date.startsWith(scope.month)||![s.total,s.copay,s.cash,s.in_kind,s.excluded].every(money)||s.copay>s.total))return fail('公費対象明細の金額・診療月・重複が不正です','INVALID_FACT');
 const grants=c.grants;
 if(!Array.isArray(grants)||new Set(grants.map(a=>a.id)).size!==grants.length)return fail('公費受給記録の重複・欠落を確認してください','INVALID_FACT');
 const uninsured=f.qualification.scheme==='MEDICAL_ASSISTANCE',w=c.welfare;
 if(w&&!['MEDICAL_ASSISTANCE','EMPLOYEE','MUTUAL'].includes(f.qualification.scheme))return fail('生活保護開始に伴う国保・後期高齢者資格の適用関係を確認してください','RULE_GAP');
 if(new Set(grants.map(a=>a.person+'|'+a.program)).size!==grants.length)return fail('同一受給者・同一制度の上限を複数回適用できません','INVALID_FACT');
 if(uninsured&&(!Array.isArray(f.qualification.members)||rows.some(s=>!f.qualification.members.some(m=>m.id===s.person&&m.eligible===true))))return fail('医療扶助の対象者と資格台帳が一致しません');
 if(uninsured&&!w)return fail('無保険の医療扶助認定が必要です');

 const used=new Set(),caps={},byId=new Map(rows.map(s=>[s.id,s]));
 for(const a of grants){
  const supported=['NANBYO','PSYCHIATRIC_OUTPATIENT','CHILD_CHRONIC'].includes(a.program);
  let cap=w&&supported?0:baseCap(a,scope.month);
  if(cap===undefined)return fail('対応する公費制度・所得区分・経過措置の確認が必要です','RULE_GAP');
  if(!a.id||!a.certificate||!a.evidence||a.verified!==true||!validDate(a.from)||!validDate(a.through)||a.from>a.through||!Array.isArray(a.statement_ids)||!a.statement_ids.length||new Set(a.statement_ids).size!==a.statement_ids.length||!Array.isArray(a.providers)||!a.providers.length||!money(a.in_kind)||!money(a.already_paid))return fail('受給者証・指定医療機関・認定期間・既給付の確認が必要です');
  for(const id of a.statement_ids){const s=byId.get(id);if(!s)return fail('公費対象明細がありません','INVALID_FACT');if(s.person!==a.person||s.date<a.from||s.date>a.through||!a.providers.includes(s.provider)||(a.program==='PSYCHIATRIC_OUTPATIENT'&&s.setting!=='outpatient'))return fail('受給者・対象診療・指定機関・有効期間が一致しません','INVALID_FACT');used.add(id);}
  if(a.program==='CHILD_CHRONIC'){const member=f.qualification.members.find(m=>m.id===a.person);if(!member||member.age>=20||(member.age>=18&&a.continued_before_18!==true))return fail('小児慢性の対象年齢・18歳前からの継続認定を確認してください');}
  if(a.versions){
   if(!Array.isArray(a.versions)||!a.versions.length||a.versions.some(v=>!v.verified||!v.evidence||!v.certificate||!validDate(v.from)||!validDate(v.through)||v.from>v.through||!Array.isArray(v.providers)))return fail('月途中の受給者証変更履歴・適用期間が必要です');
   for(const id of a.statement_ids){const s=byId.get(id),matches=a.versions.filter(v=>v.from<=s.date&&s.date<=v.through&&v.providers.includes(s.provider));if(matches.length!==1)return fail('診療日に対応する受給者証の版が欠落または重複しています','INVALID_FACT');}
   const limits=a.versions.map(v=>w?0:baseCap({...a,...v},scope.month));
   if(limits.some(v=>v===undefined))return fail('変更後の認定区分に対応する上限が未確認です');
   if(new Set(limits).size>1){const decision=a.monthly_cap_decision;if(!decision?.verified||!decision.evidence||!decision.certificate||decision.month!==scope.month||!limits.includes(decision.limit))return fail('月途中の区分変更に適用する月額上限の認定が必要です。日割りや上限再付与は行いません','INDIVIDUAL_APPROVAL');cap=decision.limit;}
   else cap=limits[0];
  }
  caps[a.id]=cap;
 }
 if(c.family){
  const h=c.family;if(h.verified!==true||!h.evidence||h.complete!==true||!h.household||h.household!==f.qualification.household||!Array.isArray(h.members))return fail('医療費算定対象世帯の受給者全員と配分前上限の確認が必要です');
  for(const m of h.members){const a=grants.find(a=>a.id===m.id);if(a){if(!['NANBYO','CHILD_CHRONIC'].includes(a.program)||m.base_limit!==caps[a.id])return fail('難病・小児慢性の配分前上限と受給者一覧が一致しません','INVALID_FACT');}else if(m.verified!==true||!m.evidence||!m.certificate||!['NANBYO','CHILD_CHRONIC'].includes(m.program)||!validDate(m.from)||!validDate(m.through)||m.from>scope.month+'-01'||m.through<new Date(Date.UTC(Number(scope.month.slice(0,4)),Number(scope.month.slice(5)),0)).toISOString().slice(0,10)||m.no_treatment_confirmed!==true||m.base_limit!==baseCap(m,scope.month))return fail('受診のない家族も、有効な支給認定と配分前上限の確認が必要です');}
  if(grants.filter(a=>['NANBYO','CHILD_CHRONIC'].includes(a.program)).some(a=>!h.members.some(m=>m.id===a.id)))return fail('難病受給者の世帯配分が不足しています');
  try{Object.assign(caps,familyCaps(h.members));}catch(e){return fail(e.message,'INVALID_FACT');}
 }else if(grants.filter(a=>['NANBYO','CHILD_CHRONIC'].includes(a.program)).length>1)return fail('複数難病受給者の医療費算定対象世帯・上限配分を確認してください');
 const alloc=c.allocations;
 if(!Array.isArray(alloc)||alloc.length!==rows.length||new Set(alloc.map(a=>a.statement_id)).size!==rows.length||alloc.some(a=>!byId.has(a.statement_id)||!a.evidence||a.verified!==true||!money(a.insurance_entitlement)||!money(a.public_in_kind)||!money(a.welfare_in_kind??0)||(a.welfare_in_kind??0)>a.public_in_kind))return fail('全明細の保険給付配分・公費現物給付の確認済み記録が必要です');
 for(const x of alloc){
  if(x.grant_in_kind&& (Object.keys(x.grant_in_kind).some(id=>!grants.some(g=>g.id===id&&g.statement_ids.includes(x.statement_id)))||Object.values(x.grant_in_kind).some(v=>!money(v))||Object.values(x.grant_in_kind).reduce((n,v)=>n+v,0)!==x.public_in_kind-(x.welfare_in_kind??0)))return fail('明細別・制度別の公費現物給付が一致しません','INVALID_FACT');
  if(grants.filter(g=>g.statement_ids.includes(x.statement_id)).length>1&&x.public_in_kind>(x.welfare_in_kind??0)&&!x.grant_in_kind)return fail('重複対象明細の現物給付を公費制度別に確認してください');
 }
 const next=structuredClone(records);next.exception_screen.value.public_aid=false;
 for(const s of next.statements.value){const a=alloc.find(a=>a.statement_id===s.id);if(s.copay!==s.cash+s.in_kind+a.public_in_kind||a.insurance_entitlement>s.copay)return fail('窓口支払・保険現物給付・公費現物給付の合計が一致しません','INVALID_FACT');s.cash+=a.public_in_kind;}
 let monthly=null;
 if(uninsured){if(f.prior_paid!==0||rows.some(s=>s.copay!==s.total||s.in_kind!==0)||alloc.some(a=>a.insurance_entitlement!==0))return fail('無保険の医療扶助に保険給付額が混在しています','INVALID_FACT');}
 else {const result=evaluate(scope,next);if(result.findings.length)return result;monthly=result.proposal;if(!monthly||alloc.reduce((n,a)=>n+a.insurance_entitlement,0)!==monthly.entitlement)return fail('高額療養費の明細別配分合計が再計算額と一致しません','INVALID_FACT');}
 const components=[],trace=[{step:'PUBLIC_ORDER',order:['健康保険・高額療養費','対象診療別公費','医療扶助']}];
 let residual=rows.reduce((n,s)=>n+s.copay,0)-(monthly?.entitlement||0);
 const priority=programPriority;
 const remaining=new Map(rows.map(s=>[s.id,s.copay-alloc.find(a=>a.statement_id===s.id).insurance_entitlement]));
 const ledger=rows.map(s=>({statement_id:s.id,parent_statement:s.parent_statement||s.id,person:s.person,date:s.date,eligible_cost:s.total,ordinary_insurance:s.total-s.copay,high_cost:alloc.find(a=>a.statement_id===s.id).insurance_entitlement,public_benefits:[],patient_liability:remaining.get(s.id)}));
 for(const a of [...grants].sort((a,b)=>priority[a.program]-priority[b.program]||a.id.localeCompare(b.id))){
  const target=rows.filter(s=>a.statement_ids.includes(s.id)),burden=target.reduce((n,s)=>n+remaining.get(s.id),0);
  const rate=a.program==='PSYCHIATRIC_OUTPATIENT'?0.1:0.2,total=target.reduce((n,s)=>n+s.total,0);
  if(!money(a.rate_share)||Math.abs(a.rate_share-total*rate)>=1)return fail('公費の確認済み負担割合額・端数処理を確認してください','INVALID_FACT');
  const patient=Math.min(burden,a.rate_share,caps[a.id]??Infinity),entitlement=burden-patient;
  if(alloc.filter(x=>a.statement_ids.includes(x.statement_id)).reduce((n,x)=>n+(x.grant_in_kind?x.grant_in_kind[a.id]??0:x.public_in_kind-(x.welfare_in_kind??0)),0)!==a.in_kind||a.in_kind+a.already_paid>entitlement)return fail('公費現物・既支給と今回の給付額が一致しません','INVALID_FACT');
  components.push({kind:'PUBLIC_AID',label:({NANBYO:'指定難病',CHILD_CHRONIC:'小児慢性',PSYCHIATRIC_OUTPATIENT:'精神通院'})[a.program]+'（'+a.person+'）',entitlement,in_kind:a.in_kind,already_paid:a.already_paid,additional:entitlement-a.in_kind-a.already_paid,patient_liability:patient,monthly_limit:caps[a.id],source:a.program==='NANBYO'?PUBLIC_SOURCES.nanbyo:a.program==='CHILD_CHRONIC'?PUBLIC_SOURCES.child:PUBLIC_SOURCES.psych});
  let portions=a.benefit_allocations;
  if(target.length===1)portions=[{statement_id:target[0].id,amount:entitlement,verified:true,evidence:a.evidence}];
  if(entitlement===0)portions=target.map(s=>({statement_id:s.id,amount:0,verified:true,evidence:a.evidence}));
  if(!Array.isArray(portions)||portions.length!==target.length||new Set(portions.map(p=>p.statement_id)).size!==target.length||portions.some(p=>!a.statement_ids.includes(p.statement_id)||!p.verified||!p.evidence||!money(p.amount)||p.amount>remaining.get(p.statement_id))||portions.reduce((n,p)=>n+p.amount,0)!==entitlement)return fail('公費の複数明細配分と計算額を照合する確認済み配分が必要です');
  for(const p of portions){remaining.set(p.statement_id,remaining.get(p.statement_id)-p.amount);const l=ledger.find(l=>l.statement_id===p.statement_id);l.public_benefits.push({grant:a.id,program:a.program,amount:p.amount,source:components.at(-1).source});l.patient_liability=remaining.get(p.statement_id);}
  residual-=entitlement;trace.push({step:'PUBLIC_RECIPIENT',recipient:a.person,grant:a.id,limit:caps[a.id],insurance_adjusted_burden:burden,patient,entitlement});
 }
 if(!w&&alloc.some(a=>(a.welfare_in_kind??0)!==0||(!used.has(a.statement_id)&&a.public_in_kind!==0)))return fail('対象外明細に公費現物給付があります','INVALID_FACT');
 if(w){
  if(w.verified!==true||!w.evidence||!w.certificate||w.other_benefits_complete!==true||!validDate(w.from)||!validDate(w.through)||!Array.isArray(w.persons)||!Array.isArray(w.providers)||rows.some(s=>!w.persons.includes(s.person)||!w.providers.includes(s.provider)||s.date<w.from||s.date>w.through)||!money(w.patient_liability)||!money(w.in_kind)||!money(w.already_paid)||w.recognized_cost!==rows.reduce((n,s)=>n+s.total,0))return fail('医療券・指定機関・対象費用・他法給付・本人支払額の認定が必要です');
  if(w.patient_liability>residual)return fail('医療扶助の認定本人支払額が残額を超えています','INVALID_FACT');
  const entitlement=residual-w.patient_liability;
  if(alloc.reduce((n,a)=>n+(a.welfare_in_kind??0),0)!==w.in_kind)return fail('医療扶助の明細配分と現物給付合計が一致しません','INVALID_FACT');
  const aidInKind=components.reduce((n,a)=>n+a.in_kind,0);
  if(alloc.reduce((n,a)=>n+a.public_in_kind,0)!==aidInKind+w.in_kind||w.in_kind+w.already_paid>entitlement)return fail('医療扶助と他公費の現物・既支給に重複があります','INVALID_FACT');
  let reimbursement=0;
  if(rows.reduce((n,s)=>n+s.cash,0)>w.patient_liability||monthly?.additional||components.some(a=>a.additional)){
   const approval=w.reimbursement;
   if(!approval?.verified||!approval.evidence||!approval.decision_id||approval.recipient!=='CITIZEN'||!money(approval.recognized_amount)||approval.recognized_amount!==entitlement-w.in_kind||!validDate(approval.decided_on)||!approval.reason||monthly?.additional||components.some(a=>a.additional))return fail('本人立替に対する福祉事務所の精算認定・他法給付の精算先確認が必要です','INDIVIDUAL_APPROVAL');
   reimbursement=approval.recognized_amount-w.already_paid;
   if(reimbursement<0||reimbursement>rows.reduce((n,s)=>n+s.cash,0)-w.patient_liability)return fail('立替認定額・本人支払・既払が一致しません','INVALID_FACT');
  }
  let welfarePortions=w.benefit_allocations;
  if(rows.length===1)welfarePortions=[{statement_id:rows[0].id,amount:entitlement,verified:true,evidence:w.evidence}];
  if(entitlement===0)welfarePortions=rows.map(s=>({statement_id:s.id,amount:0,verified:true,evidence:w.evidence}));
  if(!Array.isArray(welfarePortions)||welfarePortions.length!==rows.length||new Set(welfarePortions.map(p=>p.statement_id)).size!==rows.length||welfarePortions.some(p=>!remaining.has(p.statement_id)||!p.verified||!p.evidence||!money(p.amount)||p.amount>remaining.get(p.statement_id))||welfarePortions.reduce((n,p)=>n+p.amount,0)!==entitlement)return fail('医療扶助の明細別配分を確認してください');
  for(const p of welfarePortions){const l=ledger.find(l=>l.statement_id===p.statement_id);l.public_benefits.push({program:'MEDICAL_ASSISTANCE',amount:p.amount,source:PUBLIC_SOURCES.welfare});l.patient_liability-=p.amount;}
  components.push({kind:'MEDICAL_ASSISTANCE',label:reimbursement>0?'医療扶助（認定済み立替精算）':'医療扶助（医療機関への給付）',entitlement,in_kind:w.in_kind,already_paid:w.already_paid,additional:reimbursement,provider_payment:entitlement-w.in_kind-w.already_paid-reimbursement,patient_liability:w.patient_liability,source:reimbursement>0?PUBLIC_SOURCES.cash:PUBLIC_SOURCES.welfare});
 }
 return {findings:[],proposal:monthly,components,tool:'PUBLIC_COORDINATION',coordination_trace:trace,calculation_ledger:ledger,health_insurance_not_applicable:uninsured,insurance_exclusion_reason:uninsured?'医療扶助の無保険認定に基づき、健康保険給付を合算しません。':null};
}
