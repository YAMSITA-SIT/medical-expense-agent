import {nationalCase} from './national-fixtures.mjs';import {annualCase} from './annual-fixtures.mjs';import {nationalBasis} from './national.mjs';
export function psychiatricCase(kind='MIXED'){
 const r=nationalCase('PSYCHIATRIC_OUTPATIENT'),f=r.payload.facts,a=f.public_aid_review,s=f.statements[0];r.id='PSYCHIATRIC-'+kind;r.payload.user_id='DEMO-'+r.id;r.payload.title='精神通院・'+({MIXED:'他科の診療もある',NO_CAP:'個別月額上限なし',CERTIFICATE:'受給者証の確認待ち',PHARMACY:'指定薬局の処方あり'}[kind]);
 Object.assign(s,{total:20000,points:2000,copay:6000,cash:6000});a.rate_share=2000;
 if(kind==='MIXED'){f.statements.push({...s,id:'DENTAL',category:'dental',provider:'OTHER-DENTIST',total:10000,points:1000,copay:3000,cash:3000});a.all_treatment_eligible=false;a.scope_complete=true;a.coverage=f.statements.map(s=>({statement_id:s.id,eligible:s.id!=='DENTAL',evidence:'SYNTHETIC-COVERAGE'}));}
 if(kind==='NO_CAP'){a.income_class='middle1';a.severe_continuing=false;a.monthly_limit=null;}
 if(kind==='PHARMACY'){f.statements.push({...s,id:'RX',category:'pharmacy',provider:'DESIGNATED-PHARMACY',prescriber:s.provider,prescription_category:'medical',total:10000,points:1000,copay:3000,cash:3000});a.providers.push('DESIGNATED-PHARMACY');a.rate_share=3000;}
 a.basis=nationalBasis(f);if(kind==='CERTIFICATE')delete f.public_aid_review;
 r.payload.draft=structuredClone(f.statements);return r;
}
export function autoAnnualCase(){
 const r=annualCase({id:'ANNUAL-AUTO-EMPLOYEE',year:2025,group:'general',cash:18000});const f=r.payload.facts;r.payload.title='旧外来年間上限・入院外来の自動配分';
 const transform=f=>{const q=f.qualification;q.scheme='EMPLOYEE';q.subscriber_id=q.members[0].id;Object.assign(q.members[0],{role:'INSURED',subscriber_id:q.subscriber_id});f.income.basis='CERTIFIED_INSURER_CLASSIFICATION';f.income.certificate='SYNTHETIC-INCOME';f.statements.push({...f.statements[0],id:f.statements[0].id+'-IN',setting:'inpatient',total:300000,points:30000,copay:60000,cash:60000});};
 transform(f);for(const item of f.annual.months)transform(item.facts);f.annual.ledger_mode='AUTO_NOTIFICATION';r.payload.draft=structuredClone(f.statements);return r;
}
export const continuationCases=()=>['MIXED','NO_CAP','CERTIFICATE','PHARMACY'].map(psychiatricCase).concat(autoAnnualCase());
