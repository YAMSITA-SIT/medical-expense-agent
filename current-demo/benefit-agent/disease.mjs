const money=n=>Number.isSafeInteger(n)&&n>=0;
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export const SPECIAL_SOURCE='https://www.mhlw.go.jp/web/t_doc?dataId=84081000&dataType=0';
export const CAPD_SOURCE='https://www.mhlw.go.jp/web/t_doc?dataId=00tb0683&dataType=1&pageNo=1';
// Certified allocations are internal facts supplied by the case agent from the
// recognition and adjudicated receipt records. A diagnosis alone is insufficient.
export function calculateSpecialDisease(units,visits,registry){
 const evidence=registry?.special_units,errors=[],details=[],ordinary=[];
 if(!Array.isArray(evidence)||!evidence.length)return {resolved:false,errors:['特定疾病の認定と対象診療の対応が未確認'],details};
 if(evidence.length>200)return {resolved:false,errors:['対象診療の件数が不正'],details};
 const consumed=new Set();
 for(const u of units){
  const matches=evidence.filter(e=>e&&Array.isArray(e.statement_ids)&&e.statement_ids.length===u.ids.length&&new Set(e.statement_ids).size===u.ids.length&&u.ids.every(id=>e.statement_ids.includes(id)));
  if(matches.length!==1){errors.push('算定単位ごとの疾病対象・通常診療の区分を確認');continue;}
  const e=matches[0];consumed.add(e);
  if(e.verified!==true||typeof e.evidence!=='string'||!e.evidence.trim()||e.person_id!==u.person_id||!validDate(e.valid_from)||!validDate(e.valid_through)||e.valid_from>e.valid_through){errors.push('認定証・本人・有効期間の証拠が不足');continue;}
  if(visits.filter(v=>u.ids.includes(v.id)).some(v=>v.date<e.valid_from||v.date>e.valid_through)){errors.push('認定期間外の診療を含む');continue;}
  if(e.disease==='NONE'&&e.entire_unit===true&&e.capd===false){ordinary.push({unit:u.key,evidence:e.evidence});continue;}
  if(!['RENAL_DIALYSIS','HEMOPHILIA','HIV_BLOOD_PRODUCT'].includes(e.disease)){errors.push('特定疾病の認定区分が未対応');continue;}
  if(typeof e.capd!=='boolean'||e.entire_unit!==true){errors.push('通常診療との混在・CAPD該当有無を確認');continue;}
  if(!e.capd&&visits.some(v=>u.ids.includes(v.id)&&v.category==='pharmacy')){errors.push('CAPD以外の特定疾病の院外薬局は医療機関別の専用算定が必要');continue;}
  if(!money(u.copay)||!money(u.in_kind)||!money(u.paid)||u.paid+u.in_kind!==u.copay){errors.push('自己負担と現物給付の整合性を確認');continue;}
  if(e.disease==='RENAL_DIALYSIS'&&u.age<70&&!['a','b','c','d','e'].includes(registry.under70_group)){errors.push('透析の特例所得区分を確認');continue;}
  const limit=e.disease==='RENAL_DIALYSIS'&&u.age<70&&['a','b'].includes(registry.under70_group)?20000:10000;
  if(e.certified_limit!==limit){errors.push('認定証の上限と年齢・所得別上限が不一致');continue;}
  if(e.capd){
   if(e.disease!=='RENAL_DIALYSIS'||limit!==10000){errors.push('CAPDの疾病区分・2万円特例の適用確認が必要');continue;}
   const rows=visits.filter(v=>u.ids.includes(v.id));
   if(u.setting==='outpatient'){
    const clinics=rows.filter(v=>v.category==='medical'),pharmacies=rows.filter(v=>v.category==='pharmacy');
    if(!clinics.length||!pharmacies.length||rows.length!==clinics.length+pharmacies.length||pharmacies.some(v=>v.prescription_provider_id!==u.provider||v.prescription_category!=='medical')){errors.push('CAPDの処方元と院外薬局の対応を確認');continue;}
    if(!['FIRST','CONTINUING'].includes(e.capd_phase)||typeof e.capd_phase_evidence!=='string'||!e.capd_phase_evidence.trim()){errors.push('CAPD院外処方の初月・継続月と証拠を確認');continue;}
    if(e.capd_phase==='CONTINUING'&&clinics.some(v=>v.paid!==0)){errors.push('CAPD継続月の医療機関窓口負担を照合');continue;}
   }else if(u.setting!=='inpatient'||rows.some(v=>v.category!=='medical')){errors.push('CAPDの入院・外来区分を確認');continue;}
  }
  const entitlement=Math.max(0,u.copay-limit);
  if(u.in_kind>entitlement){errors.push('現物給付額が特定疾病算定額を超過');continue;}
  details.push({unit:u.key,person_id:u.person_id,statement_ids:u.ids,limit,entitlement,in_kind:u.in_kind,refund:entitlement-u.in_kind,retained:Math.min(u.copay,limit),evidence:e.evidence,source:e.capd?CAPD_SOURCE:SPECIAL_SOURCE,capd_phase:e.capd?e.capd_phase??'INPATIENT':null});
 }
 if(consumed.size!==evidence.length)errors.push('未対応または重複した疾病対象情報がある');
 return {resolved:errors.length===0&&details.length+ordinary.length===units.length&&details.length>0,errors:[...new Set(errors)],details,ordinary,entitlement:details.reduce((s,x)=>s+x.entitlement,0),refund:details.reduce((s,x)=>s+x.refund,0),source:SPECIAL_SOURCE};
}
