import {nextActions,FOLLOW_UP_VERSION} from './follow-up.mjs';
import {processCase} from './process.mjs';import {digest} from './store.mjs';import {retrieveUnresolved,SEARCH_VERSION} from './retrieval.mjs';
export class DecisionAgent{
 constructor({documents}){this.documents=documents;}
 async run(row){
  const result=processCase(row);result.input_snapshot=structuredClone(row.payload);result.sources=[];
  result.decision_trace=[{step:'DB_SNAPSHOT',revision:row.revision},{step:'TOOL_SELECTION',tool:result.selected_tool||'STANDARD_MONTHLY'},{step:'CALCULATION',unresolved:result.findings.map(f=>f.id||f.kind)}];
  if(!result.findings.length){result.decision_trace.push({step:'FINISHED_WITHOUT_DOCUMENT_SEARCH'});return result;}
  result.decision_trace.push({step:'SEARCH_REQUIRED',reason:'算定ツールが解決できなかった条件が残っています'});
  try{const retrieval=await retrieveUnresolved(result.findings,{month:row.payload.month,members:row.payload.facts.qualification?.members},this.documents);result.retrieval=retrieval;result.sources=retrieval.sources;result.rag_state='SEARCH_COMPLETED';result.state='PAUSED_AFTER_DOCUMENT_SEARCH';result.id=digest({base:result.id,search:SEARCH_VERSION,corpus:retrieval.corpus_fingerprint});}
  catch{result.retrieval={status:'SEARCH_FAILED',next_stage:'PAUSED_BEFORE_REASONING',ai_called:false,staff_request_sent:false};result.rag_state='UNAVAILABLE';result.state='DOCUMENT_SEARCH_FAILED';result.id=digest({base:result.id,search:SEARCH_VERSION,failed:true});}
  result.next_actions=nextActions(result);result.id=digest({base:result.id,follow_up:FOLLOW_UP_VERSION});result.decision_trace.push({step:'FOLLOW_UP_DRAFTED',sent:false},{step:result.state});return result;
 }
}
