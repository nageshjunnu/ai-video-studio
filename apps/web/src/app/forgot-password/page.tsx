'use client';
import Link from 'next/link';
import {FormEvent,useState} from 'react';
import {API} from '@/lib/api';

export default function Forgot(){
 const[msg,setMsg]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function go(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMsg('');setError('');
  const email=new FormData(e.currentTarget).get('email');
  try{
   const r=await fetch(`${API}/auth/forgot-password`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.message||'Unable to send reset email');
   setMsg(d.resetUrl?`${d.message} Local reset link: ${d.resetUrl}`:d.message);
  }catch(err){setError(err instanceof Error?err.message:'Unable to send reset email')}
  finally{setBusy(false)}
 }
 return <main className="simple-auth"><form onSubmit={go}><h1>Reset your password</h1><p>Enter your registered email address. We’ll send a reset link if the account exists.</p><input name="email" type="email" required placeholder="you@example.com"/><button disabled={busy}>{busy?'Sending…':'Send reset link'}</button>{error&&<p className="auth-error">{error}</p>}{msg&&<p className="success-note">{msg}</p>}<Link href="/login">Back to sign in</Link></form></main>
}
