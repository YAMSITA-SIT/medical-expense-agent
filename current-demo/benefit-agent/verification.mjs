// Verification is a property of a reviewed fact, never of its storage location.
export function factRecords(payload,revision){
 const demo=payload.synthetic===true&&payload.verification?.status==='SYNTHETIC_VERIFIED'&&payload.verification.evidence;
 return Object.fromEntries(Object.entries(payload.facts).map(([key,value])=>{const v=payload.fact_verification?.[key];return [key,{value,verified:v? v.status==='VERIFIED'&&!!v.evidence:!!demo,evidence:v?.evidence||(demo?payload.verification.evidence:null),revision,verification_status:v?.status||(demo?'SYNTHETIC_VERIFIED':'UNVERIFIED')}];}));
}
