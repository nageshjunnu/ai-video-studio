import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

export const runtime='nodejs';
const allowed=new Set(['audio/wav','audio/x-wav','audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/ogg']);
export async function POST(request:NextRequest){
 try{const form=await request.formData(),file=form.get('voice');if(!(file instanceof File))return NextResponse.json({error:'Select an audio file.'},{status:400});if(file.size>50*1024*1024)return NextResponse.json({error:'Audio must be smaller than 50 MB.'},{status:413});if(!allowed.has(file.type))return NextResponse.json({error:'Use WAV, MP3, M4A, AAC, or OGG audio.'},{status:415});const extension=extname(file.name).toLowerCase()||'.audio',name=`${crypto.randomUUID()}${extension}`,dir=join(process.cwd(),'public','uploads','voices');await mkdir(dir,{recursive:true});await writeFile(join(dir,name),Buffer.from(await file.arrayBuffer()));return NextResponse.json({url:`/uploads/voices/${name}`,name:file.name,size:file.size})}catch{return NextResponse.json({error:'Voice upload failed.'},{status:500})}
}
