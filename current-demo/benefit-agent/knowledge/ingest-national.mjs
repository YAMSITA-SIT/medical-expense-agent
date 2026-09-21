import {nationalSources} from './national-sources.mjs';
import {policies} from '../policy-registry.mjs';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {Cloud,settings} from '../cloud.mjs';
const db=new Cloud(await settings()),bucket='benefit-source-originals';
if(!(await db.request('/storage/v1/bucket')).some(b=>b.id===bucket))await db.request('/storage/v1/bucket',{method:'POST',body:{id:bucket,name:bucket,public:false,file_size_limit:40000000,allowed_mime_types:['application/pdf','text/html']}});
const sections=JSON.parse(await readFile(new URL('./national-sections.json',import.meta.url),'utf8'));
for(const s of nationalSources){
 const pdf=s.url.endsWith('.pdf'),extension=pdf?'.pdf':'.html',bytes=await readFile(new URL('./national-originals/'+s.id+extension,import.meta.url)),sha256=createHash('sha256').update(bytes).digest('hex'),path=s.id+'/'+sha256+extension;
 const old=await db.rest('benefit_documents?id=eq.'+s.id+'&select=sha256');
 if(old[0]?.sha256!==sha256)await db.request('/storage/v1/object/'+bucket+'/'+path,{method:'POST',raw:true,headers:{'Content-Type':pdf?'application/pdf':'text/html','x-upsert':'true'},body:bytes});
 const metadata={...s,retrieved:'2026-09-21',verification_status:s.status,applicability:'Rule scope only; not a certification of the entire document',policies:policies.filter(p=>p.sources.includes(s.id)),claim_deadline:'Separate certified claim facts',payment_start:'Separate calculation output'};
 await db.rest('benefit_documents?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:{id:s.id,title:s.title,url:s.url,storage_path:bucket+'/'+path,sha256,metadata}});
 const rows=sections.filter(p=>p.document_id===s.id).map(p=>{const compact=p.body.replace(/\s/g,'');return {id:s.id+'-'+p.page,document_id:s.id,page:p.page,body:p.body,search_text:Array.from({length:Math.max(0,compact.length-1)},(_,i)=>compact.slice(i,i+2)).join(' '),metadata:{...metadata,from:s.from,through:s.through,source_url:s.url,reference_search:true,calculation_search:false,page_kind:pdf?'PDF_PAGE':'HTML_CHUNK'}};});
 if(rows.length)await db.rest('benefit_document_sections?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:rows});console.log(s.id,rows.length);
}
