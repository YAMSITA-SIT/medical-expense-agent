export const AGE75_SOURCE='https://www.mhlw.go.jp/web/t_doc?dataId=00tb7938&dataType=1&pageNo=1';
const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function age75Persons(month,q,rows,record){
 const fail=detail=>({findings:[{id:'P14',kind:'MISSING_FACT',detail,owner:'STAFF'}]});
 if(record?.verified!==true||!record.evidence||!Array.isArray(record.value)||!record.value.length)return fail('75歳到達日・移行前後の保険者と資格の確認済み記録が必要です');
 const people=new Set();
 for(const t of record.value){
  const member=q.members.find(m=>m.id===t.person);
  if(!member||people.has(t.person)||t.verified!==true||!t.evidence||!valid(t.birth_date)||!valid(t.transfer_date)||t.only_change!==true||t.from_scheme!=='KOKUHO'||t.to_scheme!=='LATE_ELDER'||!t.from_insurer||!t.to_insurer||t.from_insurer===t.to_insurer)return fail('到達月特例の本人・生年月日・国保から後期への移行証拠を確認してください');
  const birthday=String(Number(t.birth_date.slice(0,4))+75)+t.birth_date.slice(4);
  if(t.birth_date.slice(5)==='02-29'||birthday!==t.transfer_date||birthday.slice(0,7)!==month||birthday.endsWith('-01'))return fail('月初到達・うるう日または到達日不一致です。通常の月初移行と月途中特例を区別してください');
  const before=q.scheme==='KOKUHO';
  if(q.insurer!==(before?t.from_insurer:t.to_insurer)||member.age!==(before?74:75)||rows.filter(s=>s.person===t.person).some(s=>before?s.date>=birthday:s.date<birthday))return fail('診療日が移行前後の資格と一致しません');
  people.add(t.person);
 }
 return {findings:[],people};
}
