export const API=process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api/v1';
export type Session={accessToken:string;user:{id:string;fullName:string;email:string;role:string;credits:number}};
export function session(){if(typeof window==='undefined')return null;try{return JSON.parse(localStorage.getItem('kathaforge_session')||'null') as Session|null}catch{return null}}
export function saveSession(value:Session){localStorage.setItem('kathaforge_session',JSON.stringify(value))}
export function clearSession(){localStorage.removeItem('kathaforge_session')}
export async function api<T=any>(path:string,options:RequestInit={}){const token=session()?.accessToken;const response=await fetch(`${API}${path}`,{...options,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{}) ,...options.headers} as HeadersInit});const data=await response.json().catch(()=>({}));if(response.status===401&&typeof window!=='undefined'){clearSession();location.href='/login'}if(!response.ok)throw new Error(data.message||data.error||'Request failed');return data as T}
