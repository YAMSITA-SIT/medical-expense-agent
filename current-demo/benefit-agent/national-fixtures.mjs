import {scenarios} from './scenarios.mjs';
import {annualCase} from './annual-fixtures.mjs';
import {nationalBasis} from './national.mjs';
export function nationalCase(kind){
 const r=structuredClone(scenarios()[0]);r.id='NATIONAL-'+kind;r.revision=1;const p=r.payload,f=p.facts,s=f.statements[0];p.user_id='DEMO-'+r.id;p.title='全国共通・'+kind;p.pattern='P01';
 f.qualification.scheme='EMPLOYEE';f.qualification.subscriber_id='DEMO-PERSON';Object.assign(f.qualification.members[0],{role:'INSURED',subscriber_id:'DEMO-PERSON'});Object.assign(f.income,{basis:'CERTIFIED_INSURER_CLASSIFICATION',certificate:'SYNTHETIC-INCOME-CERTIFICATE'});
 s.excluded=0;s.kind='NORMAL';
 if(kind==='MUTUAL')f.qualification.scheme='MUTUAL';
 if(kind==='FAMILY'){f.qualification.members.push({...f.qualification.members[0],id:'DEPENDENT',age:12,role:'DEPENDENT'});f.statements.push({...s,id:'CHILD',person:'DEPENDENT'});}
 if(['OVERSEAS','ORTHOSIS'].includes(kind)){
  p.pattern=kind==='OVERSEAS'?'P27':'P28';f.exception_screen[kind==='OVERSEAS'?'overseas':'orthosis']=true;s.kind=kind;s.points=null;s.cash=1000000;s.copay=1000000;
  f.reimbursement_review={verified:true,evidence:'SYNTHETIC-VALUATION',items:[{statement_id:s.id,kind,evidence:'SYNTHETIC-RECOGNITION',eligible:true,recognition_date:'2026-09-15',paid_on:'2026-07-10',deadline_start:'2026-07-11',deadline_end:'2028-07-10',deadline_basis:'SYNTHETIC-INSURER-DEADLINE',calculation_month:'2026-07',month_basis:'SYNTHETIC-INSURER-MONTH',recognized_cost:1000000,patient_share:300000,patient_percent:30,share_basis:"SYNTHETIC-CERTIFIED-SHARE",already_paid:0,covered_in_japan:true,travel_for_treatment:false,domestic_equivalent:1000000,actual_yen:1000000,currency:'USD',conversion_date:'2026-09-15',exchange_evidence:'SYNTHETIC-DECISION-DATE-RATE',medical_necessity_confirmed:true,eligible_purchase_cost:1000000}]};
 }
 if(['NANBYO','PSYCHIATRIC_OUTPATIENT'].includes(kind)){
  p.pattern='P21';f.exception_screen.public_aid=true;s.setting='outpatient';
  f.public_aid_review={verified:true,evidence:'SYNTHETIC-PUBLIC-AID',program:kind,all_treatment_eligible:true,person:s.person,from:'2026-07-01',through:'2026-07-31',providers:[s.provider],monthly_limit:kind==='NANBYO'?10000:5000,rate_share:kind==='NANBYO'?200000:100000,in_kind:0,already_paid:0,certificate:'SYNTHETIC-CERT',limit_basis:'SYNTHETIC-LIMIT',income_class:kind==='NANBYO'?'general1':'low2',high_long:false,ventilator:false,severe_continuing:false,temporary_high_income:false};
 }
 if(kind==='THIRD_PARTY'){
  p.pattern='P25';f.exception_screen.third_party=true;f.third_party_review={verified:true,evidence:'SYNTHETIC-COMPENSATION',eligibility_confirmed:true,disputed:false,same_cause_compensation:100000,benefit_offset:100000,offset_basis:'SYNTHETIC-INSURER-SAME-CAUSE-ALLOCATION'};
 }
 if(kind==='LABOR'){
  p.pattern='P26';f.exception_screen.work_injury=true;f.labor_review={verified:true,evidence:'SYNTHETIC-LABOR-AWARD',decision:'RECOGNIZED',scope_complete:true,recognized_cost:1000000,citizen_paid_eligible:300000,already_paid:100000,health_insurer_recovery:700000,settlement_route:'INSURER_TO_INSURER'};
 }
 for(const key of ['reimbursement_review','public_aid_review','third_party_review','labor_review'])if(f[key])f[key].basis=nationalBasis(f);
 p.draft=structuredClone(f.statements);return r;
}
export function familyAnnualCase(){
 const r=annualCase({id:'NATIONAL-ANNUAL-FAMILY',group:'c',age:45,cash:50000,setting:'inpatient'}),f=r.payload.facts;
 const add=mf=>{mf.qualification.members.push({...mf.qualification.members[0],id:'FAMILY',age:40});mf.statements.push({...mf.statements[0],id:mf.statements[0].id+'-FAMILY',person:'FAMILY'});};
 add(f);for(const item of f.annual.months){add(item.facts);item.allocations=item.facts.statements.map(s=>({statement_id:s.id,monthly_entitlement:3530,verified:true,evidence:'SYNTHETIC-ALLOCATION'}));}
 f.annual.ledger_mode='CERTIFIED_ALLOCATIONS';r.payload.draft=structuredClone(f.statements);r.payload.title='全国共通・家族年間上限（架空の年度終了後）';return r;
}
export function nationalCases(){return ['EMPLOYEE','MUTUAL','FAMILY','OVERSEAS','ORTHOSIS','NANBYO','PSYCHIATRIC_OUTPATIENT','THIRD_PARTY','LABOR'].map(nationalCase).concat(familyAnnualCase());}
