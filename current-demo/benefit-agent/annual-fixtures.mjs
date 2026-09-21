import {scenarios} from './scenarios.mjs';
export function annualCase({id='ANNUAL-LOW2',group='low2',age=72,cash=11000,year=2026,setting='outpatient',low=false,prior=0}={}){
 const row=structuredClone(scenarios()[0]);row.id=id;row.revision=1;
 const p=row.payload;p.title='年間上限・'+group+'（架空の年度終了後シミュレーション）';p.pattern='P30';p.user_id='DEMO-'+id;p.month=`${year+1}-07`;p.simulation_date=`${year+1}-08-01`;
 const f=p.facts;f.qualification.members[0].age=age;f.qualification.from=`${year}-08-01`;f.qualification.through=`${year+1}-07-31`;
 f.income={from:f.qualification.from,through:f.qualification.through,...(age>=70?{senior:group}:{young:group})};
 const months=[];
 for(let i=0;i<12;i++){
  const month=i<5?`${year}-${String(i+8).padStart(2,'0')}`:`${year+1}-${String(i-4).padStart(2,'0')}`;
  const mf=structuredClone(f);mf.statements=[{...mf.statements[0],id:'RECEIPT-'+month,date:month+'-12',setting,total:cash*10,points:cash,copay:cash,cash,in_kind:0,excluded:0}];mf.claim_timing.received_on=p.simulation_date;
  months.push({month,verified:true,evidence:'SYNTHETIC-LEDGER-'+id+'-'+month,facts:mf});
 }
 Object.assign(f,structuredClone(months[11].facts));f.annual={from:`${year}-08`,through:`${year+1}-07`,complete:true,months,prior_paid:prior,low_income_200_confirmed:low,low_income_200_evidence:'SYNTHETIC-CERTIFIED-INCOME'};
 p.draft=structuredClone(f.statements);return row;
}
export function annualCases(){return [annualCase(),annualCase({id:'ANNUAL-GENERAL',group:'general',cash:22000}),annualCase({id:'ANNUAL-OLD-OUT',group:'general',cash:18000,year:2025}),annualCase({id:'ANNUAL-YOUNG-C',age:45,group:'c',cash:50000,setting:'inpatient'}),annualCase({id:'ANNUAL-LOW200',age:45,group:'d',cash:40000,setting:'inpatient',low:true}),annualCase({id:'ANNUAL-PAID',prior:10000}),annualCase({id:'ANNUAL-LOW1',group:'low1',cash:15700,setting:'inpatient'})];}
