import {publicCase} from './public-fixtures.mjs';
import {nationalBasis} from './national.mjs';import {careBasis} from './care-periods.mjs';import {diseaseCase,ageCase,bothSidesCase} from './clinical-fixtures.mjs';
export function coordinationCase(kind){
 let r=publicCase('FAMILY'),f=r.payload.facts,c=f.public_coordination;
 if(['CHILD','NO-VISIT'].includes(kind)){
  f.qualification.members[1].age=10;Object.assign(c.grants[1],{program:'CHILD_CHRONIC',income_class:'general1',severe:false,continued_before_18:false});
  if(kind==='NO-VISIT'){const child=c.grants.pop();f.statements.pop();c.allocations.pop();Object.assign(c.family.members[1],child,{base_limit:5000,no_treatment_confirmed:true});}
 }
 if(kind==='OVERLAP'||kind==='PARTIAL-LINES'){
  f.statements.pop();f.qualification.members.pop();delete c.family;c.allocations.pop();c.grants[1]={...c.grants[0],id:'PSYCH',program:'PSYCHIATRIC_OUTPATIENT',income_class:'low1',rate_share:10000};
 }
 if(kind==='PARTIAL-LINES'){
  const s=f.statements[0];c.service_lines=[{id:'LINE-BOTH',statement_id:s.id,total:50000,copay:15000,cash:15000,in_kind:0,excluded:0,verified:true,evidence:'SYNTHETIC-TARGET-LINE'},{id:'LINE-ORDINARY',statement_id:s.id,total:50000,copay:15000,cash:15000,in_kind:0,excluded:0,verified:true,evidence:'SYNTHETIC-NON-TARGET-LINE'}];
  for(const g of c.grants){g.statement_ids=['LINE-BOTH'];g.rate_share=g.program==='NANBYO'?10000:5000;}
  c.allocations=c.service_lines.map(l=>({statement_id:l.id,insurance_entitlement:0,public_in_kind:0,verified:true,evidence:'SYNTHETIC-LINE-ALLOCATION'}));
 }
 if(kind==='UNINSURED-PUBLIC'||kind==='APPROVED-ADVANCE'){
  r=publicCase('WELFARE-PAID');f=r.payload.facts;c=f.public_coordination;
  if(kind==='PARTIAL-LINES'){
  const s=f.statements[0];c.service_lines=[{id:'LINE-BOTH',statement_id:s.id,total:50000,copay:15000,cash:15000,in_kind:0,excluded:0,verified:true,evidence:'SYNTHETIC-TARGET-LINE'},{id:'LINE-ORDINARY',statement_id:s.id,total:50000,copay:15000,cash:15000,in_kind:0,excluded:0,verified:true,evidence:'SYNTHETIC-NON-TARGET-LINE'}];
  for(const g of c.grants){g.statement_ids=['LINE-BOTH'];g.rate_share=g.program==='NANBYO'?10000:5000;}
  c.allocations=c.service_lines.map(l=>({statement_id:l.id,insurance_entitlement:0,public_in_kind:0,verified:true,evidence:'SYNTHETIC-LINE-ALLOCATION'}));
 }
 if(kind==='UNINSURED-PUBLIC'){f.statements[0].cash=0;c.welfare.in_kind=0;c.allocations[0].public_in_kind=30000;c.allocations[0].welfare_in_kind=0;c.grants=[{...publicCase().payload.facts.public_coordination.grants[0],id:'A',rate_share:6000,in_kind:30000}];}
  else c.welfare.reimbursement={verified:true,evidence:'SYNTHETIC-REIMBURSEMENT-DECISION',decision_id:'DECISION-1',recipient:'CITIZEN',recognized_amount:3000,decided_on:'2026-07-20',reason:'急迫事情と立替の給付対象を福祉事務所が認定した架空例'};
 }
 if(['SPECIAL-DISEASE','AGE75','PARTITION'].includes(kind)){
  r=kind==='SPECIAL-DISEASE'?diseaseCase():kind==='AGE75'?ageCase():bothSidesCase();f=r.payload.facts;f.exception_screen.public_aid=true;
  const a=structuredClone(publicCase().payload.facts.public_coordination.grants[0]);
  c={verified:true,evidence:'SYNTHETIC-CLINICAL-PUBLIC',scope_complete:true,grants:[{...a,statement_ids:f.statements.map(s=>s.id),rate_share:f.statements.reduce((n,s)=>n+s.total,0)/5}],allocations:f.statements.map(s=>({statement_id:s.id,verified:true,evidence:'SYNTHETIC-CLINICAL-ALLOCATION',insurance_entitlement:kind==='SPECIAL-DISEASE'?290000:51000,public_in_kind:0}))};
  if(kind==='PARTITION')c.grants[0].benefit_allocations=f.statements.map(s=>({statement_id:s.id,amount:4000,verified:true,evidence:'SYNTHETIC-PUBLIC-SHARE'}));
  f.public_coordination=c;
 }
 if(kind==='CERTIFICATE-CHANGE'){
  f.statements.pop();f.qualification.members.pop();c.grants.pop();c.allocations.pop();delete c.family;const a=c.grants[0];a.versions=[{verified:true,evidence:'SYNTHETIC-OLD-CERT',certificate:'OLD',from:'2026-07-01',through:'2026-07-14',providers:a.providers,income_class:'general1',high_long:false},{verified:true,evidence:'SYNTHETIC-NEW-CERT',certificate:'NEW',from:'2026-07-15',through:'2026-07-31',providers:a.providers,income_class:'general1',high_long:true}];a.monthly_cap_decision={verified:true,evidence:'SYNTHETIC-AUTHORITY-MONTH-LIMIT',certificate:'MONTH-LIMIT-DECISION',month:'2026-07',limit:5000};
 }
 if(kind==='MIDMONTH'){
  const second=f.statements.pop();f.qualification.members.pop();c.grants.pop();delete c.family;const before={...f.statements[0],id:'BEFORE',date:'2026-07-05',provider:'PRE-RECOGNITION'};f.statements[0].date='2026-07-20';f.statements.push(before);c.grants[0].from='2026-07-15';c.allocations[1]={...c.allocations[0],statement_id:'BEFORE'};
 }
 if(kind==='PROTECTION-START'){
  const before=ageCase({month:'2026-07'}).payload.facts;before.exception_screen.age75_transition=false;delete before.age75;before.qualification.scheme='KOKUHO';before.qualification.members[0].age=72;before.qualification.through=before.income.through='2026-07-14';
  const after=publicCase('WELFARE').payload.facts;after.statements[0].id='AFTER';after.statements[0].date='2026-07-20';after.qualification.from=after.income.from='2026-07-15';after.qualification.members[0].age=72;after.public_coordination.welfare.from='2026-07-15';after.public_coordination.allocations[0].statement_id='AFTER';after.public_coordination.basis=nationalBasis(after);
  f=structuredClone(before);f.exception_screen.public_aid=true;f.statements=[...before.statements,...after.statements];f.care_periods={verified:true,evidence:'SYNTHETIC-PROTECTION',protection_decision:'DEMO-DECISION',protection_start:'2026-07-15',periods:[{id:'BEFORE',verified:true,evidence:'SYNTHETIC-BEFORE',facts:before},{id:'AFTER',verified:true,evidence:'SYNTHETIC-AFTER',facts:after}]};f.care_periods.basis=careBasis(f);r.payload.facts=f;c=null;
 }
 r.id='COORD-'+kind;r.payload.user_id='DEMO-'+r.id;r.payload.title=({CHILD:'難病と小児慢性の家族配分','NO-VISIT':'受診なし家族も含む配分','PARTIAL-LINES':'明細の一部だけ公費対象',OVERLAP:'同じ診療の精神通院と難病併用','UNINSURED-PUBLIC':'無保険の難病公費と医療扶助','APPROVED-ADVANCE':'医療扶助・立替精算認定済み','SPECIAL-DISEASE':'特定疾病と難病公費',AGE75:'75歳到達月と難病公費',PARTITION:'75歳前後の保険分割と難病公費','CERTIFICATE-CHANGE':'月途中の受給者証変更・月額上限認定済み',MIDMONTH:'月途中の公費認定開始','PROTECTION-START':'月途中の生活保護開始と資格切替'})[kind];
 if(c)c.basis=nationalBasis(f);r.payload.draft=structuredClone(f.statements);return r;
}
export const coordinationCases=()=>['CHILD','NO-VISIT','OVERLAP','PARTIAL-LINES','UNINSURED-PUBLIC','APPROVED-ADVANCE','SPECIAL-DISEASE','AGE75','PARTITION','MIDMONTH','CERTIFICATE-CHANGE','PROTECTION-START'].map(coordinationCase);

export function coordinatedAnnualCase(){
 const r=coordinationCase('CHILD'),f=r.payload.facts;r.id='COORD-ANNUAL';r.payload.user_id='DEMO-COORD-ANNUAL';r.payload.title='公費年間台帳・月額照合済み／年間規程確認待ち';r.payload.month='2027-07';r.payload.simulation_date='2027-08-02';
 const months=Array.from({length:12},(_,i)=>{const month=new Date(Date.UTC(2026,7+i,1)).toISOString().slice(0,7),mf=structuredClone(f);for(const s of mf.statements)s.date=month+'-10';for(const a of mf.public_coordination.grants){a.from=month+'-01';a.through=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);}mf.public_coordination.basis=nationalBasis(mf);return {month,verified:true,evidence:'SYNTHETIC-YEAR-MONTH',facts:mf};});
 r.payload.facts=structuredClone(months[11].facts);r.payload.facts.annual={complete:true,from:'2026-08',through:'2027-07',prior_paid:0,ledger_mode:'COORDINATED_MONTHS',months};r.payload.draft=structuredClone(r.payload.facts.statements);return r;
}
