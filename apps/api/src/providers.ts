export type GenerationProgress={stage:string;progress:number;message?:string};
export interface VoiceProvider { listVoices(language?:string):Promise<unknown[]>; synthesize(text:string,options:Record<string,unknown>):Promise<{url:string;duration:number}> }
export interface VisualProvider { search(query:string):Promise<unknown[]>; generate(prompt:string,options:Record<string,unknown>):Promise<{url:string}> }
export interface StorageProvider { put(key:string,data:Uint8Array,contentType:string):Promise<{url:string}>; signedUrl(key:string,expiresIn:number):Promise<string> }
export interface RenderQueue { enqueue(projectId:string):Promise<{jobId:string}>; cancel(jobId:string):Promise<void> }
