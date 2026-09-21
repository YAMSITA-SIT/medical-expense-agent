import {seed} from './fixtures.mjs';
import {PATTERNS,SCREEN} from './catalog.mjs';
export function scenarios(){
 const output=[];
 for(const pattern of PATTERNS)for(let variant=0;variant<3;variant++){
  const id=pattern.id+'-'+(variant+1),facts=seed({put(){}}),s=facts.statements[0],q=facts.qualification;
  s.points=s.total/10;q.from='2024-01-01';q.through='2027-07-31';facts.income.from=q.from;facts.income.through=q.through;
  const n=Number(pattern.id.slice(1));
  if([5,6,7,8,9].includes(n)){q.members[0].age=n>=8?78:72;facts.income={...facts.income,senior:'general'};s.total=300000;s.points=30000;s.copay=s.cash=60000;s.setting=n===5?'outpatient':'inpatient';if(n>=8)q.scheme='LATE_ELDER';}
  if([2,3,7,9,10,19,20].includes(n)){const second={...s,id:'SECOND',provider:'DEMO-HOSPITAL-2'};if([3,7,9,10].includes(n)){q.members.push({...q.members[0],id:'DEMO-FAMILY',age:n===10?72:q.members[0].age});second.person='DEMO-FAMILY';facts.income.senior='general';}if(n===19){second.category='dental';second.provider=s.provider;}if(n===20){second.setting='outpatient';second.provider=s.provider;}facts.statements.push(second);}
  if([11,12].includes(n))facts.history.records=['2026-04','2026-05','2026-06'].map(month=>({month,kind:'MONTHLY',continuous:n===11,evidence:'DEMO-HISTORY',amount:10000}));
  if(n===18){s.total=60000;s.points=6000;s.copay=s.cash=18000;facts.statements.push({...s,id:'PHARMACY',provider:'DEMO-PHARMACY',category:'pharmacy',setting:'outpatient',prescriber:s.provider,prescription_category:'medical',total:240000,points:24000,copay:72000,cash:72000});s.setting='outpatient';}
  if(n===29){s.cash=87430;s.in_kind=212570;}
  if(n===31)s.excluded=200000;
  for(const [flag,p] of Object.entries(SCREEN))if(p===pattern.id)facts.exception_screen[flag]=true;
  if(n===15){q.members[0].age=75;q.scheme='LATE_ELDER';facts.income.senior='general';}
  if(n===32)facts.income.young=null;
  if(n===30)facts.annual={complete:false,from:'2025-08',through:'2026-07'};
  const draft=structuredClone(facts.statements);
  if(variant===1)draft[0].points=null;
  if(variant===2){draft[0].cash=null;facts.statements[0].cash=null;}
  output.push({id,payload:{title:pattern.name+' / '+['基本','空欄をDB補完','資料不足'][variant],pattern:pattern.id,user_id:'DEMO-'+id,month:'2026-07',facts,draft,synthetic:true,verification:{status:"SYNTHETIC_VERIFIED",evidence:"FIXTURE-GENERATOR-v1"}}});
 }
 const combined=structuredClone(output.find(x=>x.id==='P03-1'));combined.id='COMBINED-1';combined.payload.title='家族合算＋多数回＋現物給付';combined.payload.user_id='DEMO-COMBINED';combined.payload.facts.history=structuredClone(output.find(x=>x.id==='P11-1').payload.facts.history);combined.payload.facts.statements[0].in_kind=100000;combined.payload.facts.statements[0].cash-=100000;combined.payload.draft=structuredClone(combined.payload.facts.statements);output.push(combined);
 return output;
}
