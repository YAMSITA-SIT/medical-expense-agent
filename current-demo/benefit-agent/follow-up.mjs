export const FOLLOW_UP_VERSION='follow-up-1';
export function nextActions(result){
 return result.findings.map((f,i)=>({id:'CHECK-'+i,issue_id:f.id||f.kind,status:'DRAFT_NOT_SENT',recipient:f.owner==='CITIZEN'?'申請者':'職員・保険者担当',action:f.kind==='RULE_GAP'?'算定規程の確認':'不足情報・不一致の確認',question:f.detail,required_evidence:f.id==='P21'?'受給者証・医療券の有効期間、指定医療機関、認定所得区分、医療費算定対象世帯全員、配分前上限、明細別保険・公費現物・既給付、併用優先規程':f.id==='income'?'診療日に有効な保険者認定所得区分とその証拠':'当該論点を確認した資料と適用期間',sources:(result.retrieval?.sources||[]).map(s=>({id:s.id,url:s.citation_url})),resume:'確認済み情報を登録後、処理開始で再判定',generator:'DETERMINISTIC',sent:false}));
}
export function applyReviewedFact(row,{key,value,evidence,reviewer,confirmed}){
 if(!['income','qualification','public_aid_review','public_coordination','care_periods','history','annual'].includes(key)||confirmed!==true||typeof evidence!=='string'||!evidence.trim()||typeof reviewer!=='string'||!reviewer.trim()||!value||typeof value!=='object'||Array.isArray(value))throw Error('確認者・証拠・確認済みの対象情報が必要です');
 const p=structuredClone(row.payload),previous=p.facts[key]??null;
 p.facts[key]=structuredClone(value);p.fact_verification={...p.fact_verification,[key]:{status:'VERIFIED',evidence,reviewer,reviewed_at:new Date().toISOString()}};
 p.review_history=[...(p.review_history||[]),{key,previous,value,evidence,reviewer,from_revision:row.revision,at:new Date().toISOString()}];
 return p;
}
