import {SCREEN} from './catalog.mjs';
export const scope={tenant:'DEMO-TENANT',user_id:'DEMO-USER',month:'2026-07'};
export function seed(store,{omit=[]}={}){
 const facts={
 qualification:{scheme:'KOKUHO',insurer:'DEMO-INSURER',household:'DEMO-HOUSEHOLD',members:[{id:'DEMO-PERSON',age:45,eligible:true,insurer:'DEMO-INSURER',household:'DEMO-HOUSEHOLD'}]},
 income:{young:'c'},
 statements:[{id:'DEMO-STATEMENT',person:'DEMO-PERSON',date:'2026-07-10',provider:'DEMO-HOSPITAL',category:'medical',setting:'inpatient',total:1000000,copay:300000,cash:300000,in_kind:0,excluded:20000,final:true}],
 history:{complete:true,records:[]},exception_screen:Object.fromEntries(Object.keys(SCREEN).map(k=>[k,false])),prior_paid:0,
 claim_timing:{within_deadline:true,basis:'DEMO-INSURER-REVIEW',received_on:'2026-09-20'}
 };
 for(const [name,value] of Object.entries(facts))if(!omit.includes(name))store.put(scope,name,value,{evidence:'DEMO-'+name});return facts;
}
