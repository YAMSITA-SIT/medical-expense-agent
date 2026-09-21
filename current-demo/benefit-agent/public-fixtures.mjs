import {nationalCase} from './national-fixtures.mjs';
import {nationalBasis} from './national.mjs';
export function publicCase(kind='FAMILY'){
 const r=nationalCase('NANBYO'),f=r.payload.facts,original=f.public_aid_review,s=f.statements[0];r.id='PUBLIC-'+kind;r.payload.title='複数公費・'+kind;
 delete f.public_aid_review;
 Object.assign(s,{total:100000,points:10000,copay:30000,cash:30000});
 const c={verified:true,evidence:'SYNTHETIC-COORDINATION',scope_complete:true,grants:[],allocations:[]};f.public_coordination=c;
 if(kind.startsWith('WELFARE')){
  f.qualification.scheme='MEDICAL_ASSISTANCE';Object.assign(s,{total:30000,points:3000,copay:30000,cash:0});
  c.welfare={verified:true,evidence:'SYNTHETIC-WELFARE',certificate:'DEMO-MEDICAL-VOUCHER',other_benefits_complete:true,from:'2026-07-01',through:'2026-07-31',persons:[s.person],providers:[s.provider],recognized_cost:30000,patient_liability:0,in_kind:30000,already_paid:0};
  c.allocations=[{statement_id:s.id,verified:true,evidence:'SYNTHETIC-ALLOCATION',insurance_entitlement:0,public_in_kind:30000,welfare_in_kind:30000}];
  if(kind==='WELFARE-INSURED'||kind==='WELFARE-NANBYO'){f.qualification.scheme='EMPLOYEE';Object.assign(s,{total:1000000,points:100000,copay:300000,cash:0,in_kind:212570});Object.assign(c.welfare,{recognized_cost:1000000,in_kind:87430});Object.assign(c.allocations[0],{insurance_entitlement:212570,public_in_kind:87430,welfare_in_kind:87430});if(kind==='WELFARE-NANBYO'){c.grants=[{...original,id:'AID',verified:true,statement_ids:[s.id],rate_share:200000,in_kind:87430,already_paid:0}];c.welfare.in_kind=0;c.allocations[0].welfare_in_kind=0;}}
  if(kind==='WELFARE-PAID'){s.cash=3000;c.welfare.in_kind=27000;c.allocations[0].public_in_kind=27000;c.allocations[0].welfare_in_kind=27000;}
 }else{
  f.qualification.members.push({...f.qualification.members[0],id:'FAMILY',role:'DEPENDENT'});f.statements.push({...s,id:'FAMILY-RECEIPT',person:'FAMILY'});
  if(kind==='HIGH-COST')for(const x of f.statements)Object.assign(x,{total:1000000,points:100000,copay:300000,cash:300000});
  c.grants=f.statements.map((x,i)=>({...original,id:'GRANT-'+i,verified:true,person:x.person,statement_ids:[x.id],high_long:i===1,rate_share:x.total/5,in_kind:0,already_paid:0}));
  c.family={verified:true,evidence:'SYNTHETIC-HOUSEHOLD',complete:true,household:f.qualification.household,members:[{id:'GRANT-0',base_limit:10000},{id:'GRANT-1',base_limit:5000}]};
  c.allocations=f.statements.map(x=>({statement_id:x.id,verified:true,evidence:'SYNTHETIC-ALLOCATION',insurance_entitlement:kind==='HIGH-COST'?251285:0,public_in_kind:0}));
  if(kind==='TWO-PROGRAMS'){delete c.family;Object.assign(c.grants[1],{program:'PSYCHIATRIC_OUTPATIENT',income_class:'low2',rate_share:10000});}
 }
 c.basis=nationalBasis(f);r.payload.draft=structuredClone(f.statements);return r;
}
export const publicCases=()=>['FAMILY','HIGH-COST','TWO-PROGRAMS','WELFARE','WELFARE-INSURED','WELFARE-NANBYO','WELFARE-PAID'].map(publicCase);
