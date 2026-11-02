import { useEffect,useRef,useState } from 'react';
import { Icon } from './icons';
interface Config { configured:boolean; missing:string[]; recipient:string; message:string }
interface Result { ok?:boolean; requestId:string; sid?:string; status?:string; delivered?:boolean; providerCode?:number|null; recipient?:string; checkedAt?:string; code?:string; error?:string }
const KEY='ktx-connect-real-sms-test-v1';
function previous():Result|null{try{const r=JSON.parse(localStorage.getItem(KEY)||'null');return r&&typeof r.requestId==='string'?r:null;}catch{return null;}}
export function SmsTestPanel(){
  const [config,setConfig]=useState<Config|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [signIn,setSignIn]=useState('');
  const [busy,setBusy]=useState(false);const [result,setResult]=useState<Result|null>(previous);const lock=useRef(false);
  const remember=(r:Result)=>{setResult(r);try{localStorage.setItem(KEY,JSON.stringify(r));}catch{/* Receipts remain visible for this session. */}};
  const refresh=async()=>{setLoading(true);setError('');setSignIn('');try{const r=await fetch('/api/sms/status',{credentials:'same-origin',cache:'no-store'});const b=await r.json();if(!r.ok){setConfig(null);setError(b.error||'SMS setup is unavailable.');if(b.code==='SIGN_IN_REQUIRED')setSignIn(b.signInUrl);}else setConfig(b);}catch{setError('The SMS backend could not be reached. Open the deployed app or run the Worker preview.');}finally{setLoading(false);}};
  useEffect(()=>{void refresh();},[]);
  const send=async()=>{
    if(lock.current||!config?.configured||result)return;lock.current=true;setBusy(true);setError('');
    const requestId=crypto.randomUUID();remember({requestId,code:'DELIVERY_UNKNOWN',error:'A test is in progress. Check delivery status if this page is closed.'});
    try{const response=await fetch('/api/sms/test',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId})});const body=await response.json();remember({...body,requestId});}
    catch{remember({requestId,code:'DELIVERY_UNKNOWN',error:'The connection ended before the outcome was confirmed. A message may have been accepted. Check status before sending again.'});}
    finally{setBusy(false);lock.current=false;}
  };
  const check=async()=>{if(!result||lock.current)return;lock.current=true;setBusy(true);setError('');try{const q=new URLSearchParams({requestId:result.requestId,...(result.sid?{sid:result.sid}:{})});const r=await fetch(`/api/sms/receipt?${q}`,{credentials:'same-origin',cache:'no-store'});const b=await r.json();if(r.ok&&b.ok)remember({...b,requestId:result.requestId});else setError(b.error||'Status could not be checked.');}catch{setError('Status could not be checked. No new SMS was sent.');}finally{lock.current=false;setBusy(false);}};
  return <section className="panel sms-test-panel" aria-labelledby="sms-test-title"><div className="sms-test-heading"><span className="settings-icon"><Icon name="message"/></span><div><div className="eyebrow">OWNER-ONLY CONNECTION TEST</div><h2 id="sms-test-title">Send a real test SMS</h2><p>One generic technical message to the server’s configured test recipient.</p></div><span className={`sms-connection ${config?.configured?'connected':''}`}>{loading?'Checking…':config?.configured?'Connected':'Not connected'}</span></div>
    {loading?<p className="sms-test-help" role="status">Checking the server configuration…</p>:<>
      {error&&<div className="sms-result error" role="alert">{error}</div>}
      {signIn&&<a className="btn secondary" href={signIn} target="_top">Sign in with ChatGPT</a>}
      {config&&<><div className="sms-test-destination"><span>TEST RECIPIENT</span><strong>{config.recipient}</strong><small>The recipient is set on the server; this form cannot send to other numbers.</small></div><div className="sms-test-body"><span>MESSAGE PREVIEW</span><p>{config.message}</p><small>A unique technical reference is appended to find the receipt.</small></div>
      {!config.configured&&<div className="sms-setup"><h3>Connect your SMS provider first</h3><p>No SMS can be sent until these server settings are supplied:</p><ul>{config.missing.map(key=><li key={key}><code>{key}</code></li>)}</ul><p>Keep the Auth Token in server secrets. Do not enter it in the patient app or commit it to source.</p><a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" className="text-link">Open Twilio Console <Icon name="external" size={14}/></a><p>Trial accounts require a verified recipient. The sender must support SMS and satisfy the provider’s sending requirements.</p></div>}
      {result&&<div className={`sms-result ${result.ok?'accepted':'error'}`} role="status"><h3>{result.ok?(result.delivered?'Delivery confirmed':`Provider status: ${result.status}`):result.code==='DELIVERY_UNKNOWN'?'Outcome not confirmed':'Test not accepted'}</h3><p>{result.ok?(result.delivered?'Twilio reports that the SMS was delivered.':'A provider receipt exists. Queued, accepted, sending, or sent does not confirm delivery to the phone.'):result.error}</p>{result.sid&&<p className="receipt-line">Message SID: <code>{result.sid}</code></p>}{result.providerCode&&<p>Provider error code: {result.providerCode}</p>}<p className="receipt-line">Reference: <code>{result.requestId}</code></p></div>}
      <div className="sms-test-actions"><button className="btn" disabled={!config.configured||busy||!!result} onClick={send}><Icon name="message" size={17}/>{busy&&!result?.sid?'Sending / checking…':'Send one real test SMS'}</button>{result&&<button className="btn secondary" onClick={check} disabled={busy||!config.configured}>Check delivery status</button>}<button className="text-link" onClick={()=>void refresh()} disabled={loading||busy}>Refresh setup</button></div>
      {result&&result.code!=='DELIVERY_UNKNOWN'&&<button className="text-link new-sms-test" disabled={busy} onClick={()=>{setResult(null);try{localStorage.removeItem(KEY);}catch{}}}>Start a new test explicitly</button>}
      <p className="sms-test-help">This uses the provider account’s SMS allowance or balance. No patient details or local assessment links are sent. Profile-related messages elsewhere remain simulated.</p></>}
    </>}
  </section>;
}
