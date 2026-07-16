import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { put } from '@vercel/blob';

export const runtime='nodejs';
const allowed=new Set(['audio/wav','audio/x-wav','audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/webm']);
export async function POST(request:NextRequest){
 try{const form=await request.formData(),file=form.get('voice');if(!(file instanceof File))return NextResponse.json({error:'Select an audio file.'},{status:400});if(file.size>50*1024*1024)return NextResponse.json({error:'Audio must be smaller than 50 MB.'},{status:413});const mimeType=file.type.toLowerCase().split(';')[0].trim();if(!allowed.has(mimeType))return NextResponse.json({error:'Use WAV, MP3, M4A, AAC, OGG, or a browser recording.'},{status:415});const extension=extname(file.name).toLowerCase()||'.audio',name=`${crypto.randomUUID()}${extension}`,bytes=Buffer.from(await file.arrayBuffer());if(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN){const blob=await put(`uploads/voices/${name}`,bytes,{access:'public',contentType:mimeType||'application/octet-stream',addRandomSuffix:false});return NextResponse.json({url:blob.url,name:file.name,size:file.size})}const dir=join(process.cwd(),'public','uploads','voices');await mkdir(dir,{recursive:true});await writeFile(join(dir,name),bytes);return NextResponse.json({url:`/uploads/voices/${name}`,name:file.name,size:file.size})}catch{return NextResponse.json({error:'Voice upload failed.'},{status:500})}
}
