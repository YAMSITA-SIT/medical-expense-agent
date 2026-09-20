export const SOURCES = [
 {id:'monthly',title:'厚生労働省｜2026年8月からの見直し',url:'https://www.mhlw.go.jp/content/001726232.pdf',note:'4ページの70歳未満の月額上限・多数回該当。新制度の試算ルール。'},
 {id:'old',title:'厚生労働省｜2018年8月以降の制度説明',url:'https://www.mhlw.go.jp/content/000333280.pdf',note:'2026年7月までの月額上限の参照資料。'},
 {id:'law',title:'国民健康保険法施行令',url:'https://www.mhlw.go.jp/web/t_doc?dataId=84081000&dataType=0&pageNo=2',note:'支給要件の法令。施行日別の完全な法令照合は本番導入前に実施。'},
 {id:'application',title:'国民健康保険法施行規則 第27条の16',url:'https://www.mhlw.go.jp/web/t_doc?dataId=84082000&dataType=0&pageNo=2',note:'申請の根拠。PoCでは個人番号などの機微情報は収集しません。'},
 {id:'receipt',title:'昭和48年通知｜高額療養費支給事務の取扱い',url:'https://www.mhlw.go.jp/web/t_doc?dataId=00tb0643&dataType=1&pageNo=1',note:'レセプトに基づく支給決定、保険外費用の除外。旧限度額は使用しません。'},
 {id:'flow',title:'標準的な現行業務フロー（国保組合）',url:'https://www.mhlw.go.jp/bunya/iryouhoken/mynumber_kokuho/dl/ko_shiryo10.pdf',note:'7ページの受付・審査・決裁・通知・支払を参考に構成。'},
 {id:'spec',title:'国民健康保険システム標準仕様書',url:'https://www.mhlw.go.jp/stf/kokuho_std.html',note:'既存システム接続時の照合先。帳票や連携の完全準拠を保証するものではありません。'}
];
export const RULES={
 '2026-01_2026-07':{a:[252600,842000,140100],b:[167400,558000,93000],c:[80100,267000,44400],d:[57600,0,44400],e:[35400,0,24600]},
 '2026-08_2027-07':{a:[270300,901000,140100],b:[179100,597000,93000],c:[85800,286000,44400],d:[61500,0,44400],e:[36900,0,24600]}
};
export const GROUP_LABELS={a:'ア',b:'イ',c:'ウ',d:'エ',e:'オ'};
export const yen=n=>new Intl.NumberFormat('ja-JP').format(n)+'円';
export function makeCase(type='standard'){
 const input={name:'山田 太郎（架空）',month:'2026-08',age:45,provider:'青葉総合病院（架空）',total:1000000,paid:300000,excluded:24000,identity:true};
 const reference={householdId:'DEMO-H001',insurerId:'DEMO-KOKUHO',name:input.name,age:45,month:input.month,provider:input.provider,eligible:true,incomeVerified:true,income:3500000,taxExempt:false,historyVerified:true,history:[],annualVerified:true,annualRetained:0,receiptArrived:true,receiptTotal:1000000,receiptPaid:300000,receiptCount:1,householdMembers:1,benefitInKind:0,publicAid:false,specialDisease:false,insurerChanged:false,incomeChanged:false,bankVerified:true,bank:'デモ銀行 本店 普通 ****0123',accountToken:'DEMO-ACCOUNT-0123'};
 if(type==='old'){input.month=reference.month='2026-07';}
 if(type==='multiple'){reference.history=['2026-04','2026-05','2026-06'];reference.householdId='DEMO-H002';}
 if(type==='missing'){reference.receiptArrived=false;reference.householdId='DEMO-H003';}
 if(type==='below'){input.total=reference.receiptTotal=100000;input.paid=reference.receiptPaid=30000;reference.householdId='DEMO-H004';}
 if(type==='unsupported'){input.age=reference.age=72;reference.householdId='DEMO-H005';}
 if(type==='annual'){input.month=reference.month='2026-09';reference.annualRetained=480000;reference.householdId='DEMO-H006';}
 return {input,reference};
}
const serial=m=>{if(typeof m!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))return NaN;const [y,mo]=m.split('-').map(Number);return y*12+mo-1;};
const nonneg=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
export function groupFor(r){if(r.taxExempt===true)return 'e';if(r.income>9010000)return 'a';if(r.income>6000000)return 'b';if(r.income>2100000)return 'c';return 'd';}
export function evaluate(input,r,paidKeys=[]){
 const trace=[];const blockers=[];
 const event=(title,detail,source='application')=>trace.push({title,detail,source});
 const block=(message)=>blockers.push(message);
 const key=[r.insurerId,r.householdId,input.month].join(':');
 const version=input.month>='2026-01'&&input.month<='2026-07'?'2026-01_2026-07':input.month>='2026-08'&&input.month<='2027-07'?'2026-08_2027-07':null;
 if(!input.name?.trim()||!input.provider?.trim()||!Number.isFinite(serial(input.month))||!nonneg(input.total)||!nonneg(input.paid)||!nonneg(input.excluded)||!Number.isInteger(input.age)||input.age<0||input.age>120)block('必須項目と金額を確認してください。金額は0〜1億円の整数です。');
 if(input.identity!==true)block('本人・世帯主・登録口座の確認が未完了です。');
 event('申請を受付','申請者・診療月・金額・確認項目を検証。');
 if(!version)block('この診療月に適用する検証済みルールがありません。');
 if(input.age<18||input.age>=70)block('18〜69歳以外は標準処理の対象外です。年齢別の専門審査が必要です。');
 if(r.eligible!==true)block('診療月の国保資格を確認できません。');
 if(input.name!==r.name||input.age!==r.age||input.month!==r.month||input.provider!==r.provider)block('申請と資格・レセプト台帳の氏名、年齢、診療月または医療機関が一致しません。');
 if(r.bankVerified!==true)block('振込口座の名義・登録情報を確認できません。');
 event('資格・口座を照会（模擬）',r.eligible?'テスト台帳で資格を照会。申請との一致を検証。':'資格の確認が必要。','flow');
 if(r.incomeVerified!==true||!nonneg(r.income)||typeof r.taxExempt!=='boolean')block('所得・課税情報が未確認です。所得区分を推定せず確認に回します。');
 if(r.historyVerified!==true||!Array.isArray(r.history)||r.history.some(m=>!Number.isFinite(serial(m))))block('過去の高額療養費支給歴が確認できません。');
 const group=groupFor(r);
 const history=Array.isArray(r.history)?[...new Set(r.history)].filter(m=>serial(m)<serial(input.month)&&serial(m)>=serial(input.month)-11):[];
 const multiple=history.length>=3;
 event('所得・支給歴を照会（模擬）',`照会区分：${GROUP_LABELS[group]}。直前11か月の該当歴：${history.length}か月。`,'law');
 if(r.receiptArrived!==true)block('レセプトが未到着です。到着・審査確定後に再処理してください。');
 if(input.total!==r.receiptTotal||input.paid!==r.receiptPaid)block('申請金額とレセプト・支払確認情報が一致しません。');
 if(input.paid*10!==input.total*3)block('保険診療の支払額が総医療費の3割と一致しません。現物給付・未払・端数等を確認してください。');
 if(r.receiptCount!==1||r.householdMembers!==1||r.benefitInKind!==0||r.publicAid||r.specialDisease||r.insurerChanged||r.incomeChanged)block('世帯合算・複数レセプト・現物給付・公費等の例外があります。専門審査に回します。');
 if(paidKeys.includes(key))block('同じ保険者・世帯・診療月の模擬支払が完了済みです。二重支給を停止しました。');
 event('レセプト・重複を照合',`保険診療分と台帳を照合。対象外費用 ${yen(input.excluded)} は計算から除外。`,'receipt');
 let cap=null,amount=null,formula='',annualLimit=null;
 if(blockers.length===0){
   const [base,threshold,repeated]=RULES[version][group];
   cap=multiple?repeated:threshold?base+(input.total-threshold)/100:base;
   formula=multiple?`多数回該当の限度額：${yen(repeated)}`:threshold?`${yen(base)} ＋（${yen(input.total)} − ${yen(threshold)}）× 1%`:`定額の限度額：${yen(base)}`;
   if(!Number.isInteger(cap))block('計算に1円未満の端数が発生しました。端数処理を専門審査で確認してください。');
   cap=Math.min(input.paid,cap);
   amount=Math.max(0,input.paid-cap);
   if(version==='2026-08_2027-07'){
     annualLimit={a:1680000,b:1110000,c:530000,d:r.income<=860000?410000:530000,e:290000}[group];
     if(r.annualVerified!==true||!nonneg(r.annualRetained))block('8月〜翌7月の年間累計額が未確認です。年間上限の確認が必要です。');
     else if(r.annualRetained+cap>=annualLimit)block('年間上限に達する可能性があります。年間精算を含む専門審査が必要です。');
   }
   event('診療月のルールで計算',`${version} / 区分${GROUP_LABELS[group]}。月額試算 ${yen(amount)}。`,version==='2026-01_2026-07'?'old':'monthly');
 }
 const status=blockers.length?'review':amount===0?'zero':'ready';
 event(status==='review'?'職員確認に振り分け':status==='zero'?'支給額0円の案を作成':'支給決定案を作成',status==='review'?blockers.join(' / '):'計算と確認を完了。職員の決裁を待機。','flow');
 return {status,key,version,group,multiple,history,cap,amount,formula,annualLimit,blockers,trace,mode:'simulation',sourceCheckedAt:'2026-09-20'};
}
export class Workflow{
 constructor(){this.paid=new Map();this.current=null;this.sequence=0;}
 run(input,reference){const result=evaluate(input,reference,[...this.paid.keys()]);this.current={id:`P C-${String(++this.sequence).padStart(4,'0')}`.replace(' ',''),input:structuredClone(input),reference:structuredClone(reference),result,state:result.status,events:result.trace.map(e=>({...e,time:new Date().toISOString(),actor:'workflow'})),createdAt:new Date().toISOString()};return this.current;}
 approve(reviewer){const c=this.current;if(!c||!['ready','zero'].includes(c.state))throw new Error('決裁可能な審査結果がありません。');if(typeof reviewer!=='string'||!reviewer.trim())throw new Error('決裁者名を入力してください。');c.reviewer=reviewer.trim();c.state='approved';c.approvedAt=new Date().toISOString();c.events.push({title:'職員決裁（模擬）',detail:`${c.reviewer} が ${yen(c.result.amount)} の案を決裁。`,time:c.approvedAt,actor:'reviewer',source:'flow'});return c;}
 pay(){const c=this.current;if(!c||c.state!=='approved'||c.result.amount<=0)throw new Error('正の支給額の決裁が必要です。');if(this.paid.has(c.result.key))throw new Error('同一診療月の模擬支払が完了済みです。');const payment={id:`SIM-${c.id}`,idempotencyKey:c.result.key,amount:c.result.amount,accountToken:c.reference.accountToken,status:'simulated_success',realTransfer:false,at:new Date().toISOString()};this.paid.set(c.result.key,payment);c.payment=payment;c.state='paid';c.events.push({title:'模擬振込が完了',detail:`${payment.id} / ${yen(payment.amount)}。実送金なし。`,time:payment.at,actor:'mock-payment-adapter',source:'flow'});return c;}
 invalidate(){this.current=null;}
}
export function notice(c){if(!['approved','paid'].includes(c.state))throw new Error('通知書は職員決裁後に出力できます。');return `【PoC・架空データ／正式な行政通知ではありません】\n高額療養費 支給額決定通知書兼振込通知書（見本）\n\n発行者：デモ市 国民健康保険担当（架空）\n通知番号：${c.id}\n作成日：${c.approvedAt.slice(0,10)}\n${c.input.name} 様\n対象診療月：${c.input.month}\n医療機関：${c.input.provider}\n\n支給決定額（模擬）：${yen(c.result.amount)}\n保険診療の自己負担：${yen(c.input.paid)}\n適用後の自己負担：${yen(c.result.cap)}\n対象外費用：${yen(c.input.excluded)}（計算に含めず）\n所得区分：${GROUP_LABELS[c.result.group]}\n計算：${c.result.formula}\n診療月ルール：${c.result.version}\n決裁者（模擬）：${c.reviewer}\n\n振込先：${c.reference.bank}\n支払状態：${c.state==='paid'?'模擬振込完了（実送金なし）':c.result.amount===0?'支給額0円・振込処理なし':'未実行・模擬振込待ち'}\n${c.payment?'模擬取引番号：'+c.payment.id+'\n':''}実際の振込予定日は設定していません。\n\n根拠資料：${SOURCES.find(s=>s.id===(c.result.version==='2026-01_2026-07'?'old':'monthly')).url}\n\n本見本には実自治体の正式な様式・不服申立て案内等を含みません。\n実業務での配布・送金には使用できません。`;}
