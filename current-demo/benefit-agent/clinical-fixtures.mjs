import {scenarios} from './scenarios.mjs';
export function ageCase({month='2026-07',group='general',out=true,family=false,late=false}={}){
 const r=structuredClone(scenarios()[0]);r.id='AGE75-'+(late?'AFTER':family?'FAMILY':out?'OUT':'IN')+'-'+month+'-'+group;r.revision=1;const p=r.payload,f=p.facts;
 p.pattern='P14';p.month=month;p.title='75歳到達月・'+(late?'後期加入後':family?'家族合算':out?'外来':'入院');p.user_id='DEMO-'+r.id;
 f.qualification.scheme=late?'LATE_ELDER':'KOKUHO';f.qualification.insurer=late?'DEMO-LATE':'DEMO-INSURER';f.qualification.members[0].age=late?75:74;f.qualification.members[0].insurer=f.qualification.insurer;
 f.income.senior=group;delete f.income.young;
 Object.assign(f.statements[0],{date:month+(late?'-20':'-10'),total:300000,points:30000,copay:60000,cash:60000,excluded:0,setting:out?'outpatient':'inpatient'});
 f.exception_screen.age75_transition=true;
 f.age75=[{person:'DEMO-PERSON',birth_date:(Number(month.slice(0,4))-75)+month.slice(4)+'-15',transfer_date:month+'-15',from_scheme:'KOKUHO',to_scheme:'LATE_ELDER',from_insurer:'DEMO-INSURER',to_insurer:'DEMO-LATE',only_change:true,verified:true,evidence:'DEMO-TRANSFER-CERTIFICATE'}];
 if(family){f.qualification.members.push({...f.qualification.members[0],id:'DEMO-FAMILY',age:72});f.statements.push({...f.statements[0],id:'FAMILY',person:'DEMO-FAMILY',setting:'inpatient'});}
 p.draft=structuredClone(f.statements);return r;
}
export function diseaseCase({group='c',mixed=false,inKind=0,senior=false}={}){
 const r=structuredClone(scenarios()[0]);r.id='DISEASE-'+group+(mixed?'-MIXED':inKind?'-INKIND':senior?'-SENIOR':'');r.revision=1;const p=r.payload,f=p.facts;
 p.pattern='P24';p.title='認定特定疾病・'+(mixed?'通常診療と合算':inKind?'現物給付控除':senior?'高齢者外来':'単独診療');p.user_id='DEMO-'+r.id;
 f.income.young=group;f.exception_screen.special_disease=true;f.statements[0].in_kind=inKind;f.statements[0].cash-=inKind;
 f.special_units=[{statement_ids:[f.statements[0].id],person_id:'DEMO-PERSON',verified:true,evidence:'DEMO-DISEASE-CERTIFICATE',valid_from:'2026-07-01',valid_through:'2026-07-31',disease:'RENAL_DIALYSIS',capd:false,entire_unit:true,certified_limit:['a','b'].includes(group)?20000:10000}];
 if(senior){f.qualification.members[0].age=72;f.income.senior='low2';f.statements[0].setting='outpatient';}
 if(mixed){f.statements.push({...f.statements[0],id:'ORDINARY',provider:'OTHER',total:200000,points:20000,copay:60000,cash:60000,in_kind:0});f.special_units.push({...f.special_units[0],statement_ids:['ORDINARY'],disease:'NONE'});}
 p.draft=structuredClone(f.statements);return r;
}
export function bothSidesCase(){
 const before=ageCase(),after=ageCase({late:true}),r=structuredClone(before),f=r.payload.facts;
 r.id='AGE75-BOTH-INSURERS';r.payload.title='75歳到達月・移行前後の両保険者';f.exception_screen.insurance_change=true;
 const a=before.payload.facts,b=after.payload.facts;b.statements[0].id='AFTER';
 a.qualification.through=a.income.through='2026-07-14';b.qualification.from=b.income.from='2026-07-15';
 f.statements=[...a.statements,...b.statements];f.settlement_units=[a,b].map((x,i)=>({id:'SIDE-'+i,verified:true,evidence:'DEMO-INSURANCE-TRANSITION',statement_ids:x.statements.map(s=>s.id),qualification:x.qualification,income:x.income,history:x.history,prior_paid:x.prior_paid}));
 r.payload.draft=structuredClone(f.statements);return r;
}
export function clinicalCases(){return [ageCase(),ageCase({out:false}),ageCase({family:true}),ageCase({late:true}),ageCase({month:'2026-08'}),ageCase({out:false,group:'c'}),bothSidesCase(),diseaseCase(),diseaseCase({group:'b'}),diseaseCase({mixed:true}),diseaseCase({inKind:290000}),diseaseCase({senior:true})];}
