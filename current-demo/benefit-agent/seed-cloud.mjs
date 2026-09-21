import {Cloud,settings} from './cloud.mjs';import {scenarios} from './scenarios.mjs';
const cloud=new Cloud(await settings());const rows=scenarios().map(r=>({...r,tenant:cloud.tenant,revision:1}));
await cloud.rest('benefit_demo_cases?on_conflict=tenant,id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:rows});console.log(JSON.stringify({cases:(await cloud.list()).length}));
