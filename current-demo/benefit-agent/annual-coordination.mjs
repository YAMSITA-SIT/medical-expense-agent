import {evaluateNational} from './national.mjs';import {annualPeriod} from './annual.mjs';import {digest} from './store.mjs';
// This preparation is not an annual entitlement: retained costs alone cannot
// establish how a new annual insurance award changes public-fund liability.
export function prepareCoordinatedAnnual(month,facts){
 const a=facts.annual,period=annualPeriod(month),preparation={status:'INCOMPLETE',...period,months:[],patient_balance:0,insurance_monthly:0,public_monthly:0};
 const fail=(detail,kind='MISSING_FACT',reason_category='CASE_INFORMATION')=>({proposal:null,preparation,findings:[{id:'P30',kind,reason_category,detail,owner:'STAFF'}]});
 if(!a?.complete||a.from!==period.from||a.through!==period.through||!Array.isArray(a.months)||a.months.length!==12||new Set(a.months.map(m=>m.month)).size!==12)return fail('年間台帳の期間と12か月の確認が必要です');
 const expected=Array.from({length:12},(_,i)=>new Date(Date.UTC(Number(period.from.slice(0,4)),7+i,1)).toISOString().slice(0,7));
 if(expected.some(m=>!a.months.some(x=>x.month===m)))return fail('年間台帳に期間外・欠落月があります','INVALID_FACT');
 for(const item of [...a.months].sort((x,y)=>x.month.localeCompare(y.month))){
  const f=item.facts;if(!item.verified||!item.evidence||!f||!Array.isArray(f.statements))return fail('月別台帳の確認済み証拠が必要です');
  if(item.month===month&&digest(f.statements)!==digest(facts.statements))return fail('年間台帳と今回明細が一致しません','INVALID_FACT');
  if(!f.care_periods&&!f.settlement_units&&['qualification','income'].some(k=>!f[k]?.from||!f[k]?.through||f.statements.some(s=>s.date<f[k].from||s.date>f[k].through)))return fail(item.month+'の資格・所得の適用期間が不足しています');
  const r=evaluateNational({month:item.month},Object.fromEntries(Object.entries(f).filter(([k])=>k!=='annual').map(([k,value])=>[k,{value,verified:true,evidence:item.evidence}])));
  if(r.findings.length)return {proposal:null,preparation,findings:r.findings.map(x=>({...x,detail:item.month+'の月額公費調整：'+x.detail}))};
  const monthly=r.proposal?.entitlement||0,publicPaid=(r.components||[]).filter(c=>['PUBLIC_AID','MEDICAL_ASSISTANCE'].includes(c.kind)).reduce((n,c)=>n+c.entitlement,0),copay=f.statements.reduce((n,s)=>n+s.copay,0),net=copay-monthly-publicPaid;
  if(net<0)return fail('月額給付の二重計上を検出しました','INVALID_FACT');
  preparation.insurance_monthly+=monthly;preparation.public_monthly+=publicPaid;preparation.patient_balance+=net;
  preparation.months.push({month:item.month,insurance:monthly,public:publicPaid,patient_balance:net,ledger:r.calculation_ledger||[],evidence:item.evidence});
 }
 preparation.status='MONTHLY_RECONCILED_ANNUAL_RULE_UNCONFIRMED';
 return fail('12か月の保険・公費・本人負担は照合済みです。年間給付の公費への再配分・所得保険変更の適用通知が未確認のため、年間還付額は未確定です','RULE_GAP','SOURCE_UNCONFIRMED');
}
