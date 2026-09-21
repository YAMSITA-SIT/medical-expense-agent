import {scenarios} from './scenarios.mjs';
export function partitionCase(flag='different_insurance'){
 const sample=structuredClone(scenarios().find(s=>s.id==='P03-1'));sample.id='PARTITION-'+flag;sample.revision=1;const f=sample.payload.facts;sample.payload.title='保険者別算定 / '+flag;sample.payload.pattern=flag==='different_insurance'?'P04':flag==='insurance_change'?'P16':'P17';sample.payload.user_id='DEMO-'+sample.id;
 f.exception_screen[flag]=true;
 f.settlement_units=f.statements.map((s,i)=>({id:'UNIT-'+i,verified:true,evidence:'DEMO-QUALIFICATION-'+i,statement_ids:[s.id],qualification:{...f.qualification,insurer:'INSURER-'+i,household:'HOUSEHOLD-'+i,members:[{...f.qualification.members.find(m=>m.id===s.person),insurer:'INSURER-'+i,household:'HOUSEHOLD-'+i}]},income:structuredClone(f.income),history:structuredClone(f.history),prior_paid:0}));
 if(flag!=='different_insurance'){
  f.statements[0].date='2026-07-05';f.statements[1].date='2026-07-20';f.statements[1].person=f.statements[0].person;
  f.settlement_units[1].qualification.members[0].id=f.statements[0].person;
  f.settlement_units[0].qualification.through='2026-07-14';f.settlement_units[1].qualification.from='2026-07-15';
  sample.payload.draft=structuredClone(f.statements);
 }
 if(flag==='relocation')f.relocation_context={from_prefecture:'13',to_prefecture:'27'};
 return sample;
}
