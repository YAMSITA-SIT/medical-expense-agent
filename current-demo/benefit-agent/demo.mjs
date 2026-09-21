import {Store} from './store.mjs';import {Agent} from './agent.mjs';import {seed,scope} from './fixtures.mjs';
const store=new Store(),agent=new Agent({store});const facts=seed(store,{omit:['income']});
console.log('1. 所得資料なし →',JSON.stringify(await agent.run(scope),null,2));
store.put(scope,'income',facts.income,{evidence:'DEMO-STAFF-REPLY'});
console.log('2. 回答をDBへ保存 →',JSON.stringify(await agent.run(scope),null,2));
console.log('3. 同じ案件を再実行 →',JSON.stringify(await agent.run(scope),null,2));store.close();
