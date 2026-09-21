export const ISSUE_CATEGORIES={IMPLEMENTATION_PENDING:'実装未完了',SOURCE_UNCONFIRMED:'根拠未確認',CASE_INFORMATION:'案件情報不足・不一致',INDIVIDUAL_APPROVAL:'個別認定待ち',OUT_OF_SCOPE:'今回対象外'};
export function classifyFinding(f){
 const category=f.reason_category||(f.kind==='INDIVIDUAL_APPROVAL'?'INDIVIDUAL_APPROVAL':f.kind==='RULE_GAP'?(['P22','P23'].includes(f.id)?'OUT_OF_SCOPE':'IMPLEMENTATION_PENDING'):'CASE_INFORMATION');
 return {...f,reason_category:category,reason_label:ISSUE_CATEGORIES[category]};
}
export function resultPayments(monthly,annual,components,unresolved){
 const subtotal=(monthly?.additional||0)+(annual?.additional||0)+components.reduce((n,c)=>n+c.additional,0);
 return {citizen_refund:unresolved?null:subtotal,calculated_subtotal:subtotal,provider_payment:components.reduce((n,c)=>n+(c.provider_payment||0),0),insurer_adjustment:components.reduce((n,c)=>n+(c.insurer_recovery||0),0),in_kind_reduction:(monthly?.in_kind||0)+components.reduce((n,c)=>n+(c.in_kind||0),0),status:unresolved?'PARTIAL':'CALCULATED',requires_staff_confirmation:true};
}

export function basicLedger(f,r){
 if(r.calculation_ledger)return r.calculation_ledger;
 if(!r.proposal||r.findings.length)return [];
 return f.statements.map(s=>({statement_id:s.id,parent_statement:s.id,person:s.person,date:s.date,eligible_cost:s.total,ordinary_insurance:s.total-s.copay,high_cost:f.statements.length===1?r.proposal.entitlement:null,public_benefits:[],patient_liability:f.statements.length===1?s.copay-r.proposal.entitlement:null,allocation_status:f.statements.length===1?'CALCULATED':'NOT_ALLOCATED',sources:r.proposal.sources||[]}));
}
