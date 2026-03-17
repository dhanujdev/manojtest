const BASE='http://127.0.0.1:3210';
const URLS=[
  ['greenhouse','https://boards.greenhouse.io/figma/jobs/5813967004?gh_jid=5813967004'],
  ['greenhouse','https://boards.greenhouse.io/figma/jobs/5776278004?gh_jid=5776278004'],
  ['greenhouse','https://boards.greenhouse.io/figma/jobs/5707966004?gh_jid=5707966004'],
  ['lever','https://jobs.lever.co/ethenalabs/84a46a52-1e5f-4a86-a12b-10604ba8279a/apply'],
  ['lever','https://jobs.lever.co/vrchat/0e244c2d-f82a-42fd-8bd8-bbe635cac907/apply'],
  ['lever','https://jobs.lever.co/gr0/26b53efc-8377-4d98-a573-f38aba4283b8/apply']
];

async function api(body){const r=await fetch(BASE+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json();}
async function getJob(id){const r=await fetch(BASE+'/job/'+id);return r.json();}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function valFor(field){const l=String(field.label||'').toLowerCase();if(field.inputType==='email') return 'alex.tester@example.com';if(field.inputType==='tel') return '+12125550199';if(field.inputType==='date') return '2024-01-01';if(field.inputType==='number') return '1';if(field.inputType==='radio') return field.options?.find(o=>/yes|no|none|not yet|decline|male|female|other/i.test(o))||field.options?.[0]||'Yes';if(field.inputType==='checkbox') return field.options?.[0]?[field.options[0]]:true;if(field.inputType==='select') return field.options?.find(o=>o && !/select|choose/i.test(o)) || field.options?.[0] || '';if(field.inputType==='file') return '/etc/hosts';if(l.includes('first name')) return 'Alex';if(l.includes('last name')) return 'Tester';if(l==='name') return 'Alex Tester';if(l.includes('linkedin')) return 'https://linkedin.com/in/alextester';if(l.includes('website')||l.includes('portfolio')) return 'https://example.com';if(l.includes('github')) return 'https://github.com/alextester';if(l.includes('location')) return 'New York, NY';return 'N/A';}

await api({type:'profile.set',data:{firstName:'Alex',lastName:'Tester',email:'alex.tester@example.com',phone:'+12125550199',linkedin:'https://linkedin.com/in/alextester'}});
const results=[];
for(const [portal,url] of URLS){
  const cap=await api({type:'job.capture',url}); const jobId=cap.jobId; await api({type:'job.start',jobId});
  let loops=0,state='',error='',fieldsCount=0,finalStep=false,adapter='',filled=0,needCount=0,groupedRadio=false,groupedCheckbox=false; const seenReq=new Set();
  while(loops<600){loops++; const gj=await getJob(jobId); const j=gj.job; state=j.state; error=j.error||''; fieldsCount=j.fields?.length||0; finalStep=!!j.meta?.finalStepDetected; adapter=j.meta?.adapterName||j.portalType; filled=j.filledFields?.length||0;
    if(Array.isArray(j.fields)){groupedRadio ||= j.fields.some(f=>f.inputType==='radio'&&Array.isArray(f.options)&&f.options.length>1);groupedCheckbox ||= j.fields.some(f=>f.inputType==='checkbox'&&Array.isArray(f.options)&&f.options.length>1);}
    if(j.pendingFieldRequest && !seenReq.has(j.pendingFieldRequest.requestId)){seenReq.add(j.pendingFieldRequest.requestId);needCount++;const field=j.pendingFieldRequest.field; await api({type:'field.provide',jobId,requestId:j.pendingFieldRequest.requestId,value:valFor(field),save:true});}
    if(state==='READY_TO_SUBMIT'||state==='FAILED') break; await sleep(500);
  }
  const summary=(await api({type:'job.summary',jobId})).summary;
  const row={url,portal,jobId,state,error,fieldsCount,needCount,finalStep,adapter,filled,groupedRadio,groupedCheckbox,summary};
  results.push(row); console.log(JSON.stringify(row));
}
console.log('\nFINAL_RESULTS'); console.log(JSON.stringify(results,null,2));
