// SSK medical claim checking specification, July 2024, PDF page 91 / printed 88.
// A recorded priority is not an enabled calculation adapter.
export const PRIORITY_SOURCE='https://www.ssk.or.jp/seikyushiharai/iryokikan/download/index.files/checklogic_ika.pdf#page=91';
export const publicPriorityCatalog=[13,14,18,29,30,10,11,20,21,15,16,24,22,28,17,79,19,23,52,54,51,38,53,66,62,25,12].map((code,i)=>({law_code:String(code),priority:i+1,calculation_supported:[21,52,54,12].includes(code),source:PRIORITY_SOURCE}));
export const programPriority={PSYCHIATRIC_OUTPATIENT:9,CHILD_CHRONIC:19,NANBYO:20,MEDICAL_ASSISTANCE:27};
