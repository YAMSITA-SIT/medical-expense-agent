import {evaluateHouseholdAnnual} from './annual-household.mjs';
import {evaluate} from './rules.mjs';
import {digest} from './store.mjs';
export const ANNUAL_VERSION='annual-1.3';
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
const fail=(detail,kind='MISSING_FACT')=>({findings:[{id:'P30',kind,detail,owner:'STAFF'}],proposal:null});
const dateOK=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function annualPeriod(month){const y=Number(month.slice(0,4))-(Number(month.slice(5))<8?1:0);return {from:`${y}-08`,through:`${y+1}-07`};}
// Full-year calculation for a stable, single insured member. No fictitious
// allocation of household refunds to individual outpatient expenses is made.
export function evaluateAnnual(month,facts,{asOf=new Date().toISOString().slice(0,10)}={}){
 const a=facts.annual,period=annualPeriod(month);
 if(!a)return {findings:[],proposal:null};
 if(['CERTIFIED_ALLOCATIONS','AUTO_NOTIFICATION'].includes(a.ledger_mode))return evaluateHouseholdAnnual(month,facts,period,asOf);
 if(a.complete!==true||!Array.isArray(a.months)||a.months.length!==12)return fail('8月～翌7月の12か月分の確定明細・資格・所得・月額給付履歴が必要です。空白月を0円とは扱いません');
 if(a.from!==period.from||a.through!==period.through)return fail('年間集計期間は対象診療月を含む8月～翌7月です','INVALID_FACT');
 if(!dateOK(asOf)||asOf<=period.through+'-31')return fail('年間集計期間が終了していません。将来の明細を現在の確定給付として計算できません');
 if(period.from<'2018-08'||period.through>'2027-07')return fail('この年間算定版の対象は2027年7月までです。2027年8月以降の表は適用しません','RULE_GAP');
 if(!money(a.prior_paid))return fail('同じ年間給付の既支給額を確認してください');
 const q=facts.qualification,inc=facts.income;
 if(q?.members?.length!==1)return fail('年間給付の複数人世帯・個人外来への給付配賦は専用の算定根拠と台帳が必要です','RULE_GAP');
 const member=q.members[0],senior=member.age>=70,g=senior?inc?.senior:inc?.young,next=period.from>='2026-08';
 if(!['a','b','c','d','e','general','low1','low2'].includes(g))return fail('年間算定用の認定所得区分が不足しています');
 if(!next&&!(senior&&g==='general'))return a.prior_paid>0?fail('年間上限の対象区分と既支給記録が矛盾しています','INVALID_FACT'):{findings:[],proposal:{...period,additional:0,entitlement:0,already_paid:0,not_applicable:true,trace:[],rule_version:ANNUAL_VERSION}};
 if(next&&['d','general'].includes(g)&&(typeof a.low_income_200_confirmed!=='boolean'||!a.low_income_200_evidence))return fail('年収換算約200万円以下の41万円特例の該当有無と証拠を、認定所得から確認してください');
 const cap=next?({a:1680000,b:1110000,c:530000,d:530000,e:290000,general:530000,low1:180000,low2:290000}[g]):null;
 const annualCap=next&&a.low_income_200_confirmed===true&&['d','general'].includes(g)?410000:cap;
 // Membership or income transitions need an independent transition rule;
 // a current-month classification cannot stand in for the whole year.
 const identity=f=>digest({scheme:f.qualification?.scheme,insurer:f.qualification?.insurer,household:f.qualification?.household,members:f.qualification?.members,young:f.income?.young,senior:f.income?.senior});
 const expected=Array.from({length:12},(_,i)=>{const d=new Date(Number(period.from.slice(0,4)),7+i,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
 if(new Set(a.months.map(m=>m.month)).size!==12||expected.some(m=>!a.months.some(x=>x.month===m)))return fail('年間台帳の月が重複または欠落しています','INVALID_FACT');
 let retained=0,outRetained=0;const trace=[];
 for(const item of [...a.months].sort((x,y)=>x.month.localeCompare(y.month))){
  const f=item.facts;
  if(item.verified!==true||!item.evidence||!f||identity(f)!==identity(facts))return fail('年間を通じた資格・所得・世帯の継続性と月別台帳の証拠が必要です');
  if(['qualification','income'].some(k=>!dateOK(f[k]?.from)||!dateOK(f[k]?.through)||f[k].from>item.month+'-01'||f[k].through<new Date(Date.UTC(Number(item.month.slice(0,4)),Number(item.month.slice(5)),0)).toISOString().slice(0,10)))return fail('各月全体に有効な資格・所得期間を確認してください');
  if(item.month===month&&digest(f.statements)!==digest(facts.statements))return fail('現在の明細と年間台帳が一致しません。修正内容を確認後、月別台帳の更新が必要です','INVALID_FACT');
  if(!Array.isArray(f.statements))return fail('月別の明細情報が不足しています');
  if(!f.statements.length){
   if(item.no_treatment_confirmed!==true||!item.no_treatment_evidence||f.prior_paid!==0||Object.values(f.exception_screen||{}).some(Boolean))return fail('明細がない月の無受診・他制度給付の有無を確認してください');
   trace.push({month:item.month,copay:0,monthly_entitlement:0,retained:0,evidence:item.no_treatment_evidence});continue;
  }
  const records=Object.fromEntries(Object.entries(f).filter(([k])=>k!=='annual').map(([k,value])=>[k,{value,verified:true,evidence:item.evidence}]));
  const r=evaluate({month:item.month},records);
  if(r.findings.length)return fail(`${item.month}の月額計算が未解決です：${r.findings.map(x=>x.detail).join('／')}`);
  if(!senior&&f.statements.some(s=>s.copay<21000))return fail('年間集計における21,000円未満の明細の取扱いは専用根拠の確認が必要です','RULE_GAP');
  const hasOut=f.statements.some(s=>s.setting==='outpatient'),hasIn=f.statements.some(s=>s.setting==='inpatient');
  if(senior&&['general','low2'].includes(g)&&hasOut&&hasIn)return fail('入院・外来併用月の月額給付を個人外来へ配賦する根拠が必要です','RULE_GAP');
  const copay=f.statements.reduce((n,s)=>n+s.copay,0),net=copay-r.proposal.entitlement;
  retained+=net;if(hasOut&&!hasIn)outRetained+=net;
  trace.push({month:item.month,copay,monthly_entitlement:r.proposal.entitlement,retained:net,evidence:item.evidence});
 }
 const outCap=senior?(g==='general'?(next?216000:144000):g==='low2'&&next?96000:null):null;
 const outpatient=outCap===null?0:Math.max(0,outRetained-outCap);
 const general=annualCap===null?0:Math.max(0,retained-outpatient-annualCap);
 const entitlement=outpatient+general;
 if(a.prior_paid>entitlement)return fail('年間の既支給額が今回算定額を超えています。支給履歴との調整が必要です','INVALID_FACT');
 return {findings:[],proposal:{...period,entitlement,additional:entitlement-a.prior_paid,already_paid:a.prior_paid,outpatient_entitlement:outpatient,general_entitlement:general,outpatient_limit:outCap,general_limit:annualCap,retained_after_monthly:retained,not_before:annualCap===410000?'2027-08-01':null,requires_staff_approval:true,rule_version:ANNUAL_VERSION,sources:[next?'reform-4':'overview-4'],trace}};
}
