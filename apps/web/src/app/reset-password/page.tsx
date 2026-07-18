'use client';
import Link from 'next/link';
import {FormEvent,useEffect,useState} from 'react';
import {API} from '@/lib/api';

export default function Reset(){
 const[msg,setMsg]=useState(''),[error,setError]=useState(''),[token,setToken]=useState('');
 useEffect(()=>{setToken(new URLSearchParams(window.location.search).get('token')||'')},[]);
 async function go(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setMsg('');setError('');
  const f=new FormData(e.currentTarget),r=await fetch(`${API}/auth/reset-password`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:f.get('token'),password:f.get('password')})}),d=await r.json();
  if(!r.ok)setError(d.message||'Unable to reset password');else setMsg(d.message);
 }
 return <main className="simple-auth"><form onSubmit={go}><h1>Choose a new password</h1><input name="token" required placeholder="Reset token" value={token} onChange={e=>setToken(e.target.value)}/><input name="password" type="password" required minLength={8} placeholder="New password"/><button>Update password</button>{error&&<p className="auth-error">{error}</p>}{msg&&<p className="success-note">{msg}</p>}<Link href="/login">Return to sign in</Link></form></main>
}
