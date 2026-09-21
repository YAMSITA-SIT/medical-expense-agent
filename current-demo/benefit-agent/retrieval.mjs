import {nationalSources} from './knowledge/national-sources.mjs';
import {digest} from './store.mjs';
import {SCREEN} from './catalog.mjs';
export const SEARCH_VERSION='issue-search-4';
export const SEARCH_CHECKPOINT=true;
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
const topics={
 income:{terms:['所得区分','課税所得','標準報酬','標報','旧ただし','所得'],requires:['所得区分','課税所得','標報','旧ただし'],purpose:'対象年齢・制度時点の所得区分を確認'},
 household:{terms:['同一の医療保険','家族','合算','世帯'],requires:['同一の医療保険','同じ医療保険'],purpose:'合算可能な保険世帯の条件を確認'},
 receipt:{terms:['領収書','レセプト','審査','支払'],requires:['領収書','レセプト'],purpose:'原本・レセプトの確認に関する記載を検索'},
 deadline:{terms:['消滅時効','翌月の初日','2年'],requires:['消滅時効'],purpose:'申請期限と起算の記載を確認'},
 special_disease:{terms:['特定疾病','人工透析','血友病','HIV','月額1万円'],requires:['特定疾病','人工透析','血友病'],purpose:'疾病特例と必要な追加規定を確認'},
 additional:{terms:['付加給付','附加給付','組合独自'],requires:['付加給付','附加給付'],purpose:'保険者固有の給付規程の必要性を確認'},
 public_aid:{terms:['公費負担','医療費助成','医療扶助','小児慢性','優先順位','按分','立替'],requires:['公費負担','医療費助成','医療扶助','小児慢性','負担上限月額'],purpose:'公費・自治体助成との調整資料を検索'},
 annual:{terms:['年間上限','年単位の上限','年14.4万円','年14万4千円'],requires:['年間上限','年単位の上限','年14.4万円','年14万4千円'],exclude:['介護保険の自己負担'],purpose:'年間上限の適用時点と算定資料を検索'},
 age75:{terms:['75歳到達','誕生日','半額'],requires:['75歳到達','誕生日'],purpose:'75歳到達月の特例を検索'},
 insurance_change:{terms:['保険者が変わ','保険者変更','資格喪失','転職'],requires:['保険者が変わ','保険者変更','資格喪失','転職'],purpose:'保険変更時の計算・履歴継続条件を検索'},
 relocation:{terms:['転居','転出','住所地特例'],requires:['転居','転出','住所地特例'],purpose:'転居時の保険者と継続性の取扱いを検索'},
 third_party:{terms:['第三者','損害賠償','交通事故'],requires:['第三者','損害賠償','交通事故'],purpose:'第三者行為の給付調整を検索'},
 work_injury:{terms:['労災','業務上','通勤災害'],requires:['労災','業務上','通勤災害'],purpose:'業務・通勤災害の保険適用を検索'},
 overseas:{terms:['海外療養','海外','国内の治療'],requires:['海外療養','海外'],purpose:'海外療養の対象費用と換算規定を検索'},
 orthosis:{terms:['治療用装具','装具','療養費の支給'],requires:['治療用装具','装具'],purpose:'装具の療養費認定と高額療養費の関係を検索'},
 history:{terms:['多数回','過去12か月','4回目'],requires:['多数回','4回目'],purpose:'履歴の計上条件を確認'},
 excluded:{terms:['差額ベッド','食費','保険適用'],requires:['差額ベッド','食費'],purpose:'保険外費用・標準負担の除外を確認'},
 unknown:{terms:[],requires:[],purpose:'検索論点を特定できません'}
};
const issueTopics={CARE_PERIODS:'insurance_change',P04:'household',SETTLEMENT_UNITS:'household',PARTITION_CONFLICT:'receipt',PARTITION_PERIOD:'insurance_change',PARTITION_EVIDENCE:'insurance_change',PARTITION_UNASSIGNED:'insurance_change',PARTITION_SAME_INSURER:'relocation',RELOCATION_SCOPE:'relocation',PARTITION_OVERLAP:'insurance_change',P14:'age75',P16:'insurance_change',P17:'relocation',P21:'public_aid',P22:'additional',P23:'additional',P24:'special_disease',P25:'third_party',P26:'work_injury',P27:'overseas',P28:'orthosis',P30:'annual',P32:'income',income:'income',history:'history',claim_timing:'deadline',statements:'receipt',settlement:'receipt'};
export function classifyIssue(f){
 if(issueTopics[f.id])return issueTopics[f.id];if(SCREEN[f.id]&&issueTopics[SCREEN[f.id]])return issueTopics[SCREEN[f.id]];const s=f.detail||'';
 for(const [re,topic] of [[/所得|収入区分/,'income'],[/領収|明細|支払|点数|DB情報/,'receipt'],[/年間|年額/,'annual'],[/時効|期限/,'deadline'],[/保険が異|別の保険|世帯/,'household'],[/多数回|履歴/,'history'],[/食費|ベッド/,'excluded']])if(re.test(s))return topic;
 return 'unknown';
}
export function searchIssue(finding,{month,members=[]},sections){
 const topic=classifyIssue(finding),policy=topics[topic],rejected={period:0,navigation:0,topic:0,age:0};
 const scored=[];
 for(const section of sections){
  if(!((['guide','reform','overview'].includes(section.document_id)&&section.metadata?.calculation_search===true)||(nationalSources.some(s=>s.id===section.document_id&&s.url===section.metadata?.source_url)&&section.metadata?.reference_search===true))||!section.metadata?.from||!section.metadata?.through||month<section.metadata.from||month>section.metadata.through){rejected.period++;continue;}
  if((section.document_id==='guide'&&[1,2,8].includes(section.page))||(section.document_id==='reform'&&section.page===1)){rejected.navigation++;continue;}
  if(topic==='income'&&members.length&&section.document_id==='guide'&&((members.every(m=>m.age<70)&&section.page===4)||(members.every(m=>m.age>=70)&&section.page===5))){rejected.age++;continue;}
  const body=clean(section.body),required=policy.requires.map(clean);
  if(!required.some(term=>body.includes(term))||(policy.exclude||[]).some(term=>body.includes(clean(term)))){rejected.topic++;continue;}
  const matched=policy.terms.filter(term=>body.includes(clean(term)));
  const score=matched.reduce((n,t)=>n+Math.min(8,clean(t).length),0)/Math.log2(10+body.length);
  scored.push({...section,score:Number(score.toFixed(4)),matched_terms:matched,citation_url:section.metadata.page_kind==='HTML_CHUNK'?section.metadata.source_url:`${section.metadata.source_url}#page=${section.page}`,evidence_role:'REFERENCE_ONLY'});
 }
 scored.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return {issue_id:finding.id||topic,topic,purpose:policy.purpose,query:policy.terms,status:scored.length?'REFERENCE_FOUND':'NO_APPLICABLE_SOURCE',sufficient_for_calculation:false,reason:scored.length?'論点に関係する原文候補です。未解決条件の算定根拠が揃ったと自動認定しません。':'登録資料から対象時点・論点に合う本文を確認できません。無関係な文書で補いません。',hits:scored.slice(0,3),rejected};
}
export async function retrieveUnresolved(findings,context,adapter){
 const sections=await adapter.loadKnowledge();const searches=findings.map(f=>searchIssue(f,context,sections));
 return {version:SEARCH_VERSION,corpus_fingerprint:digest(sections),queries:searches,sources:[...new Map(searches.flatMap(s=>s.hits).map(s=>[s.id,s])).values()],status:'SEARCH_COMPLETED',next_stage:'PAUSED_BEFORE_REASONING',ai_called:false,staff_request_sent:false};
}
