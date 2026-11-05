export async function careApi(path:string,body?:unknown){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 let result;try{result=await response.json();}catch{throw new Error('The shared backend could not be reached. Please try again.');}
 if(!response.ok||!result.ok)throw Object.assign(new Error(result.error||'The request could not be completed.'),{code:result.code,signInUrl:result.signInUrl,outbox:result.outbox});return result;
}
export type TeamActor={id:string;email:string;role:'admin'|'clinician'|'coordinator'};
export const roleLabels={admin:'Admin',clinician:'Clinician',coordinator:'Coordinator'};
