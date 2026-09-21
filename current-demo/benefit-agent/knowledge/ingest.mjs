import {metadataFor,sources} from './manifest.mjs';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {Cloud,settings} from '../cloud.mjs';
const cloud=new Cloud(await settings()),bucket='benefit-documents';const buckets=await cloud.request('/storage/v1/bucket');
if(!buckets.some(b=>b.id===bucket))await cloud.request('/storage/v1/bucket',{method:'POST',body:{id:bucket,name:bucket,public:false,file_size_limit:10000000,allowed_mime_types:['application/pdf']}});
const docs=JSON.parse(await readFile(new URL('./sections.json',import.meta.url),'utf8'));
for(const doc of docs){const bytes=await readFile(new URL('./originals/'+doc.id+'.pdf',import.meta.url)),hash=createHash('sha256').update(bytes).digest('hex'),path=doc.id+'/'+hash+'.pdf';
 const existing=await cloud.rest('benefit_documents?id=eq.'+doc.id+'&select=sha256');if(existing[0]?.sha256!==hash)await cloud.request('/storage/v1/object/'+bucket+'/'+path,{method:'POST',raw:true,headers:{'Content-Type':'application/pdf','x-upsert':'true'},body:bytes});
 const metadata={retrieved:'2026-09-20',applicability:'See individual page metadata; document includes multiple periods'};
 await cloud.rest('benefit_documents?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:{id:doc.id,title:sources[doc.id].title,url:'https://www.mhlw.go.jp/content/'+sources[doc.id].file+'.pdf',storage_path:bucket+'/'+path,sha256:hash,metadata}});
 const rows=doc.pages.map(p=>{const metadata=metadataFor(doc.id,p.page);const compact=p.body.replace(/\s/g,'');const tokens=Array.from({length:Math.max(0,compact.length-1)},(_,i)=>compact.slice(i,i+2)).join(' ');return {id:doc.id+'-'+p.page,document_id:doc.id,page:p.page,body:p.body,search_text:metadata.calculation_search?tokens:"",metadata};});
 await cloud.rest('benefit_document_sections?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:rows});console.log(doc.id,rows.length);
}
console.log('search results',(await cloud.search('世帯','2026-07')).length);
