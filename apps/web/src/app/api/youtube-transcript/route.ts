import {NextRequest,NextResponse} from 'next/server';
import {serverApiUrl} from '@/lib/server-api';

function videoId(value:string){try{const url=new URL(value);if(url.hostname==='youtu.be')return url.pathname.split('/').filter(Boolean)[0]??'';if(url.hostname.includes('youtube.com'))return url.searchParams.get('v')||url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1]||''}catch{}return''}
function decode(value:string){return value.replace(/<[^>]+>/g,' ').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/\s+/g,' ').trim()}
async function responseJson(response:Response){const raw=await response.text();if(!raw.trim())return null;try{return JSON.parse(raw)}catch{return null}}
async function captionText(baseUrl:string){const headers={'user-agent':'Mozilla/5.0','accept-language':'en-US,en;q=0.9'};
 const jsonUrl=`${baseUrl}${baseUrl.includes('?')?'&':'?'}fmt=json3`,jsonResponse=await fetch(jsonUrl,{headers,cache:'no-store'}),jsonRaw=await jsonResponse.text();
 if(jsonResponse.ok&&jsonRaw.trim()){try{const captions=JSON.parse(jsonRaw),text=(captions.events??[]).flatMap((event:any)=>event.segs??[]).map((segment:any)=>segment.utf8??'').join(' ').replace(/\s+/g,' ').trim();if(text)return text}catch{}}
 const xmlResponse=await fetch(baseUrl,{headers,cache:'no-store'}),xml=await xmlResponse.text();if(!xmlResponse.ok||!xml.trim())return '';
 const legacy=[...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match=>decode(match[1])).join(' ');if(legacy.trim())return legacy.replace(/\s+/g,' ').trim();
 const srv3=[...xml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(match=>decode(match[1])).join(' ');return srv3.replace(/\s+/g,' ').trim()
}
export async function POST(request:NextRequest){try{
 const auth=request.headers.get('authorization')||'',accessResponse=await fetch(`${serverApiUrl()}/creator-tools/access`,{headers:{authorization:auth},cache:'no-store'}),access=await responseJson(accessResponse);
 if(!accessResponse.ok||!access)return NextResponse.json({error:'The API is unavailable or authentication has expired. Please sign in again.'},{status:accessResponse.status||503});
 if(!access.available?.videoTranscript)return NextResponse.json({error:`Video transcription is disabled or requires at least ${access.minimumCredits} credits.`},{status:403});
 const body=await request.json(),url=String(body.url??''),language=String(body.language??'en'),id=videoId(url);if(!id)return NextResponse.json({error:'Enter a valid YouTube video URL.'},{status:400});
 const pageResponse=await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=en`,{headers:{'user-agent':'Mozilla/5.0','accept-language':'en-US,en;q=0.9'},cache:'no-store'}),page=await pageResponse.text();if(!pageResponse.ok||!page.trim())return NextResponse.json({error:'YouTube did not return the video page. Please try again.'},{status:502});
 const marker='"captionTracks":',start=page.indexOf(marker);if(start<0)return NextResponse.json({error:'This video does not expose public subtitles or automatic captions.'},{status:422});
 let position=start+marker.length,depth=0,inString=false,escaped=false,end=-1;for(;position<page.length;position++){const char=page[position];if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;continue}if(char==='"')inString=true;else if(char==='[')depth++;else if(char===']'&&--depth===0){end=position+1;break}}
 if(end<0)return NextResponse.json({error:'YouTube returned incomplete caption metadata.'},{status:502});let tracks:any[];try{tracks=JSON.parse(page.slice(start+marker.length,end))}catch{return NextResponse.json({error:'YouTube returned invalid caption metadata.'},{status:502})}
 const requested=language.split('-')[0],track=tracks.find(item=>item.languageCode===requested)||tracks.find(item=>item.languageCode?.startsWith(requested))||tracks.find(item=>item.kind==='asr')||tracks[0];if(!track?.baseUrl)return NextResponse.json({error:'No usable caption track was found.'},{status:422});
 const text=await captionText(track.baseUrl);if(!text)return NextResponse.json({error:'YouTube listed captions for this video but returned an empty caption file. The owner may restrict transcript access.'},{status:422});
 return NextResponse.json({text,language:track.languageCode,name:track.name?.simpleText||track.languageCode});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Transcript generation failed.'},{status:500})}}
