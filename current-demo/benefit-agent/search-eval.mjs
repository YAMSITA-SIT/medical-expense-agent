import {writeFile} from 'node:fs/promises';import {Cloud,settings} from './cloud.mjs';import {searchIssue,classifyIssue} from './retrieval.mjs';import {benchmarks} from './search-benchmark.mjs';
const cloud=new Cloud(await settings()),sections=await cloud.loadKnowledge(),cache=new Map(),results=[];
for(const [name,issue,context,expected] of benchmarks){
 const topic=classifyIssue(issue),query=topic==='income'?'所得':topic==='receipt'?'領収 OR 支払':'世帯 OR 高額',key=query+context.month;
 if(!cache.has(key))cache.set(key,await cloud.search(query,context.month));
 const before=cache.get(key).slice(0,3).map(r=>r.id),after=searchIssue(issue,context,sections).hits.map(r=>r.id);
 results.push({name,expected,before,after,positive:expected.length>0,before_correct:expected.length?before.some(id=>expected.includes(id)):before.length===0,after_correct:expected.length?after.some(id=>expected.includes(id)):after.length===0});
}
const positive=results.filter(r=>r.positive),negative=results.filter(r=>!r.positive);
const metrics={corpus_pages:sections.length,positive_cases:positive.length,negative_cases:negative.length,before:{hit_at_3:positive.filter(r=>r.before_correct).length,negative_rejection:negative.filter(r=>r.before_correct).length},after:{hit_at_3:positive.filter(r=>r.after_correct).length,negative_rejection:negative.filter(r=>r.after_correct).length}};
await writeFile(new URL('../outputs/文書検索・検証結果.json',import.meta.url),JSON.stringify({metrics,limitations:'開発用22問の確認セットです。未知の案件の検索精度や法的な根拠充足率を保証しません。',results},null,2));console.log(JSON.stringify(metrics));
