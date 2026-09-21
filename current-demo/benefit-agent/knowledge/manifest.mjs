export const sources={guide:{title:'高額療養費制度を利用される皆さまへ',file:'000333280'},reform:{title:'高額療養費制度の見直し',file:'001726232'},overview:{title:'高額療養費制度の概要・見直し説明資料',file:'001729632'}};
// Mixed-period comparison pages and policy proposals are archived, but are not
// calculation search candidates. A PDF publication date is not an effective date.
export function metadataFor(id,page){
 let from=null,through=null;
 if(id==='guide'){from='2018-08';through='2026-07';}
 if(id==='reform'&&page===4||id==='overview'&&page===2){from='2026-08';through='2027-07';}
 if(id==='reform'&&page===5||id==='overview'&&page===3){from='2027-08';through='9999-12';}
 if(id==='overview'&&page===4){from='2018-08';through='2026-07';}
 const searchable=!!from&&!(id==='guide'&&[1,2,8].includes(page));
 return {from,through,calculation_search:searchable,role:searchable?'DATED_REFERENCE':'ARCHIVE_ONLY',source_url:'https://www.mhlw.go.jp/content/'+sources[id].file+'.pdf',retrieved:'2026-09-20',review:'Page-scoped applicability; mixed-period pages excluded from calculation search'};
}
export function sectionsFor(docs){return docs.flatMap(d=>d.pages.map(p=>({id:d.id+'-'+p.page,document_id:d.id,...p,metadata:metadataFor(d.id,p.page)})));}
