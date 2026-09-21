import {evaluate} from './rules.mjs';
export const SPECIALIST_VERSION='specialist-1';
const partitionFlags=['different_insurance','insurance_change','relocation'];
const problem=(id,detail,kind='MISSING_FACT')=>({id,kind,detail,owner:'STAFF'});
const wrap=(value,evidence)=>({value,verified:true,evidence});
export function evaluateWithSpecialists(scope,records){
 const screen=records.exception_screen?.value;
 if(!screen||!records.exception_screen.verified||!records.exception_screen.evidence)return evaluate(scope,records);
 if(partitionFlags.some(f=>screen[f]))return evaluatePartitions(scope,records);
 return evaluate(scope,records);
}
function evaluatePartitions(scope,records){
 if(records.exception_screen.value.relocation){const move=records.relocation_context;
  if(move?.verified!==true||!move.evidence||!move.value?.from_prefecture||!move.value?.to_prefecture)return {findings:[problem('RELOCATION_SCOPE','転出前後の都道府県と国保資格の確認済み情報が必要です')],tool:'PARTITION_BY_INSURANCE'};
  if(move.value.from_prefecture===move.value.to_prefecture)return {findings:[problem('P17','同一都道府県内の国保転居に係る限度額・履歴継続特例の根拠確認が必要です','RULE_GAP')],tool:'PARTITION_BY_INSURANCE'};
 }
 const bundle=records.settlement_units,rows=records.statements?.value;
 if(bundle?.verified!==true||!bundle.evidence||!Array.isArray(bundle.value)||!bundle.value.length)return {findings:[problem('SETTLEMENT_UNITS','保険者・保険世帯・資格期間ごとの明細の割当と、各区分の所得・給付履歴が必要です。住所だけでは合算しません。')],tool:'PARTITION_BY_INSURANCE'};
 if(records.statements?.verified!==true||!records.statements.evidence||!Array.isArray(rows)||new Set(rows.map(r=>r.id)).size!==rows.length)return {findings:[problem('PARTITION_CONFLICT','元の明細の確認済み証拠が不足、または明細IDが重複しています','INVALID_FACT')],tool:'PARTITION_BY_INSURANCE'};
 const used=new Set(),unitIds=new Set(),findings=[],proposals=[];
 for(const unit of bundle.value){
  if(!unit||!unit.id||unitIds.has(unit.id)||unit.verified!==true||!unit.evidence||!Array.isArray(unit.statement_ids)||!unit.statement_ids.length||!unit.qualification||!unit.income||!unit.history||!Number.isSafeInteger(unit.prior_paid)||unit.prior_paid<0){findings.push(problem('PARTITION_EVIDENCE','算定区分の確認済み資格・所得・履歴・既支給額・証拠参照が不足しています'));continue;}
  unitIds.add(unit.id);const selected=[];
  for(const id of unit.statement_ids){const row=rows.find(r=>r.id===id);if(!row||used.has(id)){findings.push(problem('PARTITION_CONFLICT','明細の重複割当または存在しない明細への参照があります','INVALID_FACT'));continue;}used.add(id);selected.push(row);}
  const q=unit.qualification,inc=unit.income;
  const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  const periodValid=[q,inc].every(f=>validDate(f.from)&&validDate(f.through)&&f.from<=f.through&&selected.every(r=>r.date>=f.from&&r.date<=f.through));
  if(!periodValid){findings.push(problem('PARTITION_PERIOD','区分内の診療日に有効な資格・所得の適用期間を確認してください'));continue;}
  // Splitting does not clear any other special condition. It cannot turn
  // public aid, an age-75 transition, or an accident into a standard case.
  const next={...records,qualification:wrap(q,unit.evidence),income:wrap(inc,unit.evidence),history:wrap(unit.history,unit.evidence),prior_paid:wrap(unit.prior_paid,unit.evidence),statements:wrap(selected,bundle.evidence),exception_screen:wrap({...records.exception_screen.value,...Object.fromEntries(partitionFlags.map(k=>[k,false]))},bundle.evidence)};
  const evaluated=evaluate(scope,next);
  if(evaluated.findings.length)findings.push(...evaluated.findings.map(f=>({...f,unit:unit.id})));
  else proposals.push({unit:unit.id,insurer:q.insurer,household:q.household,statement_ids:unit.statement_ids,...evaluated.proposal});
 }
 if(used.size!==rows.length)findings.push(problem('PARTITION_UNASSIGNED','いずれの保険者・資格期間にも割り当てられていない明細があります'));
 // Same insurer/household must not be split into arbitrary smaller caps.
 const keys=bundle.value.filter(u=>u?.qualification).map(u=>u.qualification.insurer+'|'+u.qualification.household);
 if(new Set(keys).size!==keys.length)findings.push(problem('PARTITION_SAME_INSURER','同一保険者・同一保険世帯の分割が重複しています。継続性を確認し統合した算定区分が必要です','INVALID_FACT'));
 for(let i=0;i<bundle.value.length;i++)for(let j=i+1;j<bundle.value.length;j++){const a=bundle.value[i]?.qualification,b=bundle.value[j]?.qualification;if(a?.members&&b?.members&&a.members.some(m=>b.members.some(n=>n.id===m.id))&&a.from<=b.through&&b.from<=a.through)findings.push(problem('PARTITION_OVERLAP','同じ受診者の資格期間が複数保険者で重複しています','INVALID_FACT'));}
 if(findings.length)return {findings,tool:'PARTITION_BY_INSURANCE',partial_results:proposals};
 const sum=k=>proposals.reduce((n,p)=>n+p[k],0);
 return {findings:[],tool:'PARTITION_BY_INSURANCE',proposal:{scope:'SEPARATE_INSURANCE_UNITS',entitlement:sum('entitlement'),in_kind:sum('in_kind'),already_paid:sum('already_paid'),additional:sum('additional'),units:proposals,trace:proposals.flatMap(p=>p.trace.map(t=>({...t,unit:p.unit,insurer:p.insurer}))),sources:[...new Set(proposals.flatMap(p=>p.sources))],requires_staff_approval:true,annual_status:'SEPARATE_CHECK_REQUIRED'}};
}
