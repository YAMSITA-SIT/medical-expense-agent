// Only the reviewed scope is enabled; COLLECTION/REVIEWING is never executable.
export const policies=[
 {id:'PUBLIC_COORDINATION',version:2,status:'VERIFIED',from:'2025-04',through:'2027-07',sources:['national-nanbyo-household','national-child-order','national-public-priority','national-welfare-cash','national-medical-assistance','national-psychiatric'],scope:'認定済み難病・小児慢性の世帯配分、21/52/54/12の対象診療別併用、医療扶助・認定済み立替精算。対象部分と複数明細の配分は確認済み台帳を照合'},
 {id:'MONTHLY',version:2,status:'VERIFIED',from:'2018-08',through:'2027-07',sources:['guide','reform'],scope:'認定年齢・所得・保険世帯による月額給付'},
 {id:'REIMBURSEMENT',version:1,status:'VERIFIED',from:'2018-08',through:'2027-07',sources:['national-overseas','national-reimbursement'],scope:'確認済み認定費用・患者負担・算定月。価格査定は対象外'},
 {id:'PUBLIC_AID',version:1,status:'VERIFIED',from:'2025-04',through:'2027-07',sources:['national-nanbyo','national-psychiatric'],scope:'単独受給者の対象診療。精神通院高所得特例は2027-03まで'},
 {id:'COORDINATION',version:1,status:'VERIFIED',from:'2018-08',through:'2027-07',sources:['national-accident','national-labor'],scope:'認定済みの給付対応賠償・労災費用の精算のみ'},
 {id:'ANNUAL_TRANSITION_2026',version:1,status:'REVIEWING',from:'2026-08',through:'2027-07',sources:['reform','overview'],scope:'新年間世帯上限の所得・保険変更。区分決定・配分手順を確認中'}
];
export const selectPolicy=(id,month)=>policies.find(p=>p.id===id&&p.status==='VERIFIED'&&p.from<=month&&p.through>=month)||null;
