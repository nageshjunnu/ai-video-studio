import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import ffprobe from "@ffprobe-installer/ffprobe";
import { put } from "@vercel/blob";
import { serverApiUrl } from "@/lib/server-api";

export const runtime = "nodejs";
export const maxDuration = 300;

type RenderInput = {
  title?: string;
  showTitleScreen?: boolean;
  script?: string;
  format?: "16:9" | "9:16" | "1:1";
  voice?: string;
  speed?: number;
  style?: string;
  uploadedVoiceUrl?: string;
  backgroundMusicUrl?: string;
  backgroundMusicPreset?: "ambient" | "cinematic";
  backgroundMusicVolume?: number;
  uploadedMediaUrls?: string[];
  showCaptions?: boolean;
  captionPosition?: "top" | "bottom";
  captionSize?: "small" | "medium" | "large";
  useRelatedVideos?: boolean;
  templateOnly?: boolean;
  showBranding?: boolean;
  showEngagementCta?: boolean;
  imageAnimation?: "none" | "zoom" | "pan" | "fade";
  providerOverrides?: Partial<Record<"pixabayImages"|"pexelsImages"|"openverseImages"|"huggingFaceImages"|"geminiVisualPrompts"|"geminiTts"|"relatedVideoClips", boolean>>;
};

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    let stderr = "";
    const child = spawn(command, args);
    child.stderr.on("data", (d) => (stderr += d));
    child.stdout.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stderr)
        : reject(new Error(stderr.slice(-1200) || `${command} exited ${code}`)),
    );
  });
}
function cloudinaryConfig() {
  const url = process.env.CLOUDINARY_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      return {
        cloudName: parsed.hostname,
        apiKey: decodeURIComponent(parsed.username),
        apiSecret: decodeURIComponent(parsed.password),
      };
    } catch {}
  }
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  };
}
function hasCloudinaryStorage() {
  const config = cloudinaryConfig();
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}
async function uploadCloudinaryVideo(file:string,id:string) {
  const config = cloudinaryConfig();
  if (!config.cloudName || !config.apiKey || !config.apiSecret) throw new Error("Cloudinary storage is not configured.");
  const timestamp = Math.floor(Date.now()/1000),
    publicId = `renders/${id}`,
    params = `folder=drishyana&public_id=${publicId}&resource_type=video&timestamp=${timestamp}${config.apiSecret}`,
    signature = createHash("sha1").update(params).digest("hex"),
    form = new FormData();
  form.set("file", new Blob([await readFile(file)], { type: "video/mp4" }));
  form.set("api_key", config.apiKey);
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  form.set("folder", "drishyana");
  form.set("public_id", publicId);
  form.set("resource_type", "video");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/video/upload`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Cloudinary upload failed: ${await response.text()}`);
  const data = await response.json();
  return data.secure_url || data.url;
}
function runInput(command: string, args: string[], input: string) {
  return new Promise<void>((resolve, reject) => {
    let stderr = "";
    const child = spawn(command, args);
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr || `${command} exited ${code}`)),
    );
    child.stdin.end(input);
  });
}
function narrationChunks(text: string, limit = 650) {
  const sentences = text.match(/[^.!?।\n]+[.!?।]+|[^.!?।\n]+$/gu) ?? [text], chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const value = sentence.trim();
    if (!value) continue;
    if ((current + " " + value).trim().length <= limit) current = `${current} ${value}`.trim();
    else {
      if (current) chunks.push(current);
      if (value.length <= limit) current = value;
      else {
        const words = value.split(/\s+/u); current = "";
        for (const word of words) {
          if ((current + " " + word).trim().length > limit && current) { chunks.push(current); current = word; }
          else current = `${current} ${word}`.trim();
        }
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
function geminiVoiceName(voice: string, telugu: boolean) {
  if (voice === "Venkatesh") return "Puck";
  if (voice.startsWith("Child")) return "Kore";
  return telugu ? "Kore" : "Kore";
}
function geminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
}
function hfApiKey() {
  return process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY || "";
}
async function kokoroTts(text:string,voice:string,telugu:boolean,work:string){
  const key=hfApiKey(),model=process.env.KOKORO_TTS_MODEL||"hexgrad/Kokoro-82M";
  if(!key||!process.env.KOKORO_TTS_MODEL)return null;
  const output=join(work,"kokoro-narration.wav"),raw=join(work,"kokoro-narration.audio");
  const prompt=telugu?`Read naturally in Telugu:\n${text}`:text;
  const voiceName=voice==="Venkatesh"?"am_adam":voice.startsWith("Child")?"af_bella":"af_heart";
  const response=await fetch(`https://api-inference.huggingface.co/models/${model}`,{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json",accept:"audio/wav"},body:JSON.stringify({inputs:prompt,parameters:{voice:voiceName,speed:1},options:{wait_for_model:false}}),signal:AbortSignal.timeout(process.env.VERCEL?12_000:30_000)});
  if(!response.ok){const message=await response.text().catch(()=>"");throw new Error(`Kokoro TTS ${response.status}: ${message.slice(0,220)||response.statusText}`)}
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!bytes.length)throw new Error("Kokoro TTS did not return audio.");
  await writeFile(raw,bytes);
  await run(ffmpeg.path,["-i",raw,"-ac","1","-ar","24000","-y",output]);
  return output;
}
async function geminiTts(text: string, voice: string, telugu: boolean, work: string) {
  const key = geminiApiKey();
  if (!key) return null;
  const model = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
  const chunks = narrationChunks(text, 900),
    files: string[] = [],
    voiceName = geminiVoiceName(voice, telugu);
  for (let index = 0; index < chunks.length; index++) {
    const pcm = join(work, `gemini-tts-${String(index).padStart(3, "0")}.pcm`),
      wav = join(work, `gemini-tts-${String(index).padStart(3, "0")}.wav`),
      prompt = telugu
        ? `Read the following Telugu narration naturally and clearly. Speak only the narration text.\n\n${chunks[index]}`
        : `Read the following narration naturally and clearly. Speak only the narration text.\n\n${chunks[index]}`;
    let audio = "";
    let lastError = "";
    for (let attempt = 0; attempt < 2 && !audio; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          }),
          signal: AbortSignal.timeout(process.env.VERCEL ? 25_000 : 45_000),
        },
      );
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        lastError = response.status===429
          ? "Gemini TTS quota/billing is depleted. Add billing or credits in Google AI Studio, or switch to Kokoro/own voice."
          : `Gemini TTS ${response.status}: ${message.slice(0, 260) || response.statusText}`;
        continue;
      }
      const data = await response.json();
      audio = data?.candidates?.[0]?.content?.parts?.find((part: any) => part?.inlineData?.data)?.inlineData?.data ?? "";
    }
    if (!audio) throw new Error(lastError || "Gemini TTS did not return audio.");
    await writeFile(pcm, Buffer.from(audio, "base64"));
    await run(ffmpeg.path, ["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", pcm, "-ac", "1", "-ar", "24000", "-y", wav]);
    files.push(wav);
  }
  if (files.length === 1) return files[0];
  const output = join(work, "gemini-narration.wav"),
    args = files.flatMap((file) => ["-i", file]),
    inputs = files.map((_, index) => `[${index}:a]`).join("");
  args.push("-filter_complex", `${inputs}concat=n=${files.length}:v=0:a=1[a]`, "-map", "[a]", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-y", output);
  await run(ffmpeg.path, args);
  return output;
}
async function piperTts(text:string,piper:string,model:string,work:string){
  const output = join(work, "narration.wav");
  const chunks = narrationChunks(text), files: string[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const file = join(work, `narration-${String(index).padStart(3, "0")}.wav`);
    await runInput(piper,["--model",model,"--output_file",file],chunks[index]);
    if (!existsSync(file)) throw new Error(`Piper did not create narration chunk ${index + 1}`);
    files.push(file);
  }
  if (files.length === 1) return files[0];
  const args = files.flatMap(file => ["-i", file]), inputs = files.map((_, index) => `[${index}:a]`).join("");
  args.push("-filter_complex",`${inputs}concat=n=${files.length}:v=0:a=1[a]`,"-map","[a]","-ac","1","-ar","22050","-c:a","pcm_s16le","-y",output);
  await run(ffmpeg.path,args);
  return output;
}
function scenesFrom(script: string) {
  const blocks = script
    .split(/\n+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const scenes: string[] = [];
  for (const block of blocks) {
    if (/^\d+[.)]\s*/.test(block) || block.length <= 180) {
      scenes.push(block);
      continue;
    }
    const sentences = block.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/gu) ?? [block];
    let current = "";
    for (const sentence of sentences) {
      if ((current + " " + sentence).trim().length > 220 && current) {
        scenes.push(current.trim());
        current = sentence;
      } else current += " " + sentence;
    }
    if (current.trim()) scenes.push(current.trim());
  }
  return scenes.filter(Boolean).slice(0, 48);
}
function compactScenes(scenes: string[], limit: number) {
  if (scenes.length <= limit) return scenes;
  const compacted: string[] = [];
  for (let index = 0; index < limit; index++) {
    const start = Math.floor((index * scenes.length) / limit);
    const end = Math.floor(((index + 1) * scenes.length) / limit);
    compacted.push(scenes.slice(start, Math.max(start + 1, end)).join(" "));
  }
  return compacted.filter(Boolean);
}
function wrap(value: string, max = 30) {
  const words = value.split(" "),
    lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}
function mediaQuery(text: string, index = 0) {
  const map: [RegExp, string[]][] = [
    [
      /నవరత్న|కాళిదాస|వరాహమిహిర/u,
      [
        "Navaratnas Vikramaditya court",
        "Kalidasa Indian poet art",
        "ancient Indian scholars manuscript",
      ],
    ],
    [
      /బేతాళ|శ్మశాన/u,
      [
        "Vikram Betal illustration",
        "Vetala Indian folklore art",
        "ancient Indian ghost story painting",
      ],
    ],
    [
      /మహాకాళ|దేవాలయ|శివ/u,
      [
        "Mahakaleshwar Temple Ujjain",
        "Shiva temple India heritage",
        "Ujjain temple architecture",
      ],
    ],
    [
      /సింహాసన|సాలభంజిక/u,
      [
        "Vikramaditya throne illustration",
        "ancient Indian royal throne",
        "Indian palace sculpture",
      ],
    ],
    [
      /ఉజ్జయిని|ఉజ్జయిన్/u,
      ["Ujjain India heritage", "Ram Ghat Ujjain", "Ujjain city temple"],
    ],
    [
      /యుద్ధ|శకుల|శాలివాహన/u,
      [
        "ancient Indian king battle painting",
        "Indian warriors historical art",
        "ancient India army illustration",
      ],
    ],
    [
      /రాజసభ|రాజు|విక్రమాదిత్య/u,
      [
        "King Vikramaditya painting",
        "ancient Indian royal court",
        "Indian king palace illustration",
      ],
    ],
    [
      /పండిత|విద్య|సాహిత్య/u,
      [
        "ancient Indian manuscript art",
        "Indian scholars historical painting",
        "Sanskrit manuscript India",
      ],
    ],
    [
      /రైత|ప్రజ|వ్యాపార/u,
      [
        "historic Indian village painting",
        "Indian farmers rural heritage",
        "ancient India market illustration",
      ],
    ],
    [
      /దాన|బ్రాహ్మణ|బంగారు/u,
      [
        "ancient Indian charity painting",
        "Indian temple donation art",
        "historic India generosity illustration",
      ],
    ],
  ];
  const matched = map.find(([r]) => r.test(text))?.[1];
  if (matched) return matched[index % matched.length];
  const english = text
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 3 &&
        !/^(this|that|with|from|have|were|their|about|story|introduction)$/i.test(
          word,
        ),
    )
    .slice(0, 6)
    .join(" ");
  return (
    english ||
    [
      "Indian history heritage",
      "Indian culture historical art",
      "ancient India illustration",
    ][index % 3]
  );
}
function videoQuery(text: string, title: string, index = 0) {
  const map: [RegExp, string[]][] = [
    [
      /ఉజ్జయిని|ఉజ్జయిన్|విక్రమాదిత్య|రాజసభ|రాజు/u,
      ["Ujjain India", "Ram Ghat Ujjain", "Ujjain heritage city"],
    ],
    [
      /మహాకాళ|దేవాలయ|శివ/u,
      ["Ujjain India", "Shiva temple India", "Hindu temple ritual India"],
    ],
    [
      /యుద్ధ|శకుల|శాలివాహన/u,
      [
        "Indian historical reenactment",
        "Indian fort heritage",
        "Indian traditional warriors",
      ],
    ],
    [
      /పండిత|విద్య|సాహిత్య|నవరత్న|కాళిదాస/u,
      [
        "Sanskrit manuscript India",
        "Indian classical literature",
        "Indian museum manuscript",
      ],
    ],
    [
      /రైత|ప్రజ|వ్యాపార/u,
      [
        "Indian village life",
        "Indian farmers agriculture",
        "traditional market India",
      ],
    ],
    [
      /దాన|బ్రాహ్మణ|బంగారు/u,
      [
        "Indian temple ritual",
        "community service India",
        "Hindu ceremony India",
      ],
    ],
    [
      /బేతాళ|శ్మశాన/u,
      [
        "Indian folklore performance",
        "Indian storytelling theatre",
        "Ujjain India",
      ],
    ],
  ];
  const matched = map.find(([r]) => r.test(text))?.[1];
  if (matched) return matched[index % matched.length];
  const source = `${title} ${text}`
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 3 &&
        !/^(this|that|with|from|have|were|their|about|story|introduction|complete)$/i.test(
          word,
        ),
    )
    .slice(0, 5)
    .join(" ");
  return (
    source ||
    ["India culture", "historic architecture", "traditional community"][
      index % 3
    ]
  );
}
function scriptKeywords(title:string,script:string){
  const mapped:string[]=[];
  const pairs:[RegExp,string][]=[
    [/విక్రమాదిత్య|vikramaditya/i,"Vikramaditya Ujjain ancient Indian king royal court"],
    [/ఉజ్జయిని|ఉజ్జయిన్|ujjain/i,"Ujjain India Mahakaleshwar temple heritage"],
    [/బేతాళ|vetala|betal/i,"Vikram Betal Indian folklore night forest"],
    [/నవరత్న|కాళిదాస|kalidasa|navaratna/i,"ancient Indian scholars Sanskrit manuscript royal court"],
    [/మహాకాళ|శివ|mahakal|shiva/i,"Mahakaleshwar Shiva temple Ujjain"],
    [/యుద్ధ|శకుల|war|battle/i,"ancient Indian warriors fort battle"],
    [/రైత|village|farmer/i,"Indian village farmers rural life"],
    [/ai|artificial intelligence|machine learning|robot|technology/i,"artificial intelligence futuristic technology"]
  ];
  for(const [pattern,value] of pairs)if(pattern.test(`${title} ${script}`))mapped.push(value);
  const english=`${title} ${script}`.replace(/[^a-zA-Z0-9 ]/g," ").toLowerCase().split(/\s+/).filter(word=>word.length>3&&!/^(this|that|with|from|have|were|their|about|story|video|image|history|introduction|conclusion|officially|republic|country|world|people|important)$/i.test(word));
  const counts=new Map<string,number>();
  for(const word of english)counts.set(word,(counts.get(word)??0)+1);
  const common=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([word])=>word).join(" ");
  return Array.from(new Set([...mapped,common].filter(Boolean))).slice(0,5);
}
function titleContextQuery(title: string, index: number, kind: "image" | "video") {
  const contexts: [RegExp, string[], string[]][] = [
    [
      /విక్రమాదిత్య|vikramaditya/i,
      ["Vikramaditya Ujjain", "Mahakaleshwar Ujjain", "Ram Ghat Ujjain", "Ujjain Madhya Pradesh heritage"],
      ["Ujjain India", "Ram Ghat Ujjain", "Ujjain heritage city"],
    ],
    [
      /హర్షవర్ధన|harshavardhana/i,
      ["Harshavardhana India", "Thanesar Haryana heritage", "Kannauj India heritage"],
      ["Thanesar Haryana", "Kannauj India", "North India heritage"],
    ],
  ];
  const match = contexts.find(([pattern]) => pattern.test(title));
  if (!match) return null;
  const choices = kind === "video" ? match[2] : match[1];
  return choices[index % choices.length];
}
function teluguVisualQueries(text:string,index=0){
  const source=text.normalize("NFC");
  const groups:[RegExp,string[]][]=[
    [/భారతదేశ|భారత్|రాష్ట్ర|కేంద్రపాలిత|జిల్లా|మండలం|తహసీల్/u,["India states map culture","Indian government building flag","India geography map","Indian city administration","India diverse landscape"]],
    [/విక్రమాదిత్య|ఉజ్జయిని|ఉజ్జయిన్/u,["Vikramaditya Ujjain royal court","Ujjain Mahakaleshwar temple","ancient Indian king palace","Ram Ghat Ujjain heritage"]],
    [/రాజు|రాజసభ|సింహాసన/u,["ancient Indian royal court","Indian king palace throne","historic Indian palace interior"]],
    [/దేవాలయ|శివ|మహాకాళ|హరసిద్ధి/u,["Indian temple architecture","Mahakaleshwar temple Ujjain","Hindu temple ritual India"]],
    [/యుద్ధ|సైన్య|వీర|శకుల/u,["ancient Indian warriors fort","Indian historical battle painting","Indian fort heritage"]],
    [/పండిత|విద్య|సాహిత్య|కవి|నవరత్న/u,["ancient Indian scholars manuscript","Sanskrit manuscript India","Indian literature palm leaf manuscript"]],
    [/రైత|గ్రామ|ప్రజ|వ్యాపార/u,["Indian village life","Indian farmers agriculture","traditional Indian market"]],
    [/బేతాళ|శ్మశాన|కథ/u,["Indian folklore storytelling","Vikram Betal illustration","ancient Indian forest night story"]]
  ];
  const found=groups.find(([pattern])=>pattern.test(source))?.[1];
  return found?.[index%found.length]??null;
}
function visualEnglishText(text:string,index=0){
  const mapped=teluguVisualQueries(text,index);
  const ascii=text.replace(/[^a-zA-Z0-9 ,.-]/g," ").replace(/\s+/g," ").trim();
  return (mapped||ascii||"cinematic Indian story scene").slice(0,260);
}
type MediaCredit = {
  title: string;
  source: string;
  artist: string;
  license: string;
};
function providerQueries(query:string){
  const teluguQuery=teluguVisualQueries(query);
  const ascii=query.replace(/[^a-zA-Z0-9 ]/g," ").replace(/\s+/g," ").trim(),words=ascii.split(" ").filter(word=>word.length>2&&!/^(the|and|from|with|story|video|image|introduction|history|officially|republic|country|world)$/i.test(word));
  const focused=words.slice(0,5).join(" "),ai=/\b(ai|artificial intelligence|machine learning|robot|technology|digital)\b/i.test(ascii),india=/\b(india|indian|bharat|ujjain|temple|king|royal|heritage|ancient)\b/i.test(ascii);
  const queries=Array.from(new Set([
    teluguQuery,
    focused,
    focused ? `cinematic ${focused}` : null,
    focused ? `documentary ${focused}` : null,
    ai ? "artificial intelligence technology future" : null,
    india ? "Indian heritage temple royal culture" : null,
    ascii,
  ].filter(Boolean))) as string[];
  return process.env.VERCEL ? queries.slice(0,3) : queries;
}
async function visualPrompts(title:string,scene:string,fallbackImage:string,fallbackVideo:string){
  const key=geminiApiKey();
  if(!key)return {image:fallbackImage,video:fallbackVideo};
  try{
    const prompt=`Create short English media search queries for this video scene. Use concrete visual keywords only: places, people, objects, action, era, culture, environment. Return JSON only: {"image":"...","video":"..."}\nTitle: ${title || "Untitled"}\nScene: ${scene.slice(0,700)}`;
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.25,maxOutputTokens:120,responseMimeType:"application/json"}}),signal:AbortSignal.timeout(process.env.VERCEL?3500:8000)});
    if(!response.ok)return {image:fallbackImage,video:fallbackVideo};
    const data=await response.json(),text=data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!text)return {image:fallbackImage,video:fallbackVideo};
    const parsed=JSON.parse(text),clean=(value:any,fallback:string)=>{const query=String(value??"").replace(/[^a-zA-Z0-9 ,.-]/g," ").replace(/\s+/g," ").trim();return query.length>5?query.slice(0,120):fallback};
    return {image:clean(parsed?.image,fallbackImage),video:clean(parsed?.video,fallbackVideo)};
  }catch{return {image:fallbackImage,video:fallbackVideo}}
}
async function pixabayImage(query:string,output:string,seed:number,portrait:boolean,used:Set<string>):Promise<MediaCredit|null>{
  const key=process.env.PIXABAY_API_KEY;if(!key)return null;
  for(const search of providerQueries(query)){try{const params=new URLSearchParams({key,q:search.slice(0,100),image_type:"photo",orientation:portrait?"vertical":"horizontal",min_width:portrait?"720":"1280",min_height:portrait?"1280":"720",safesearch:"true",order:"popular",per_page:"30"}),response=await fetch(`https://pixabay.com/api/?${params}`,{signal:AbortSignal.timeout(process.env.VERCEL?2200:10000)});if(!response.ok)continue;const data=await response.json(),hits=(data.hits??[]).filter((hit:any)=>(hit.largeImageURL||hit.webformatURL)&&!used.has(hit.pageURL)),hit=hits[seed%Math.max(1,hits.length)];if(!hit)continue;const image=await fetch(hit.webformatURL||hit.largeImageURL||hit.fullHDURL,{signal:AbortSignal.timeout(process.env.VERCEL?3200:18000)});if(!image.ok)continue;const bytes=Buffer.from(await image.arrayBuffer());if(!bytes.length||bytes.length>25_000_000)continue;await writeFile(output,bytes);used.add(hit.pageURL);return{title:hit.tags||search,source:hit.pageURL,artist:hit.user||"Pixabay contributor",license:"Pixabay Content License"}}catch{continue}}return null;
}
async function pixabayVideo(query:string,outputBase:string,seed:number,portrait:boolean):Promise<{path:string;credit:MediaCredit}|null>{
  const key=process.env.PIXABAY_API_KEY;if(!key)return null;
  for(const search of providerQueries(query)){try{const maxSize=process.env.VERCEL?18_000_000:45_000_000,params=new URLSearchParams({key,q:search.slice(0,100),video_type:"film",orientation:portrait?"vertical":"horizontal",safesearch:"true",order:"popular",per_page:"25"}),response=await fetch(`https://pixabay.com/api/videos/?${params}`,{signal:AbortSignal.timeout(process.env.VERCEL?4500:10000)});if(!response.ok)continue;const data=await response.json(),hits=(data.hits??[]).filter((hit:any)=>hit.videos?.medium?.url||hit.videos?.large?.url||hit.videos?.small?.url),hit=hits[seed%Math.max(1,hits.length)];if(!hit)continue;const choices=[hit.videos?.medium,hit.videos?.small,hit.videos?.large].filter((file:any)=>file?.url&&Number(file.width||0)>=640&&Number(file.size||0)<=maxSize),selected=choices[0];if(!selected)continue;const video=await fetch(selected.url,{signal:AbortSignal.timeout(process.env.VERCEL?9000:25000)});if(!video.ok)continue;const bytes=Buffer.from(await video.arrayBuffer());if(!bytes.length||bytes.length>maxSize)continue;const path=`${outputBase}.mp4`;await writeFile(path,bytes);return{path,credit:{title:hit.tags||`${search} video`,source:hit.pageURL,artist:hit.user||"Pixabay contributor",license:"Pixabay Content License"}}}catch{continue}}return null;
}
async function pexelsImage(query:string,output:string,seed:number,portrait:boolean,used:Set<string>):Promise<MediaCredit|null>{
  const key=process.env.PEXELS_API_KEY;if(!key)return null;
  for(const search of providerQueries(query)){try{const params=new URLSearchParams({query:search,orientation:portrait?"portrait":"landscape",size:"large",per_page:"30"}),response=await fetch(`https://api.pexels.com/v1/search?${params}`,{headers:{Authorization:key},signal:AbortSignal.timeout(process.env.VERCEL?2200:10000)});if(!response.ok)continue;const data=await response.json(),photos=(data.photos??[]).filter((photo:any)=>photo.src?.large2x&&!used.has(photo.url)),photo=photos[seed%Math.max(1,photos.length)];if(!photo)continue;const image=await fetch(photo.src.large2x||photo.src.large||photo.src.original,{signal:AbortSignal.timeout(process.env.VERCEL?3200:18000)});if(!image.ok)continue;const bytes=Buffer.from(await image.arrayBuffer());if(!bytes.length||bytes.length>25_000_000)continue;await writeFile(output,bytes);used.add(photo.url);return{title:photo.alt||search,source:photo.url,artist:photo.photographer||"Pexels contributor",license:"Pexels License"}}catch{continue}}return null
}
async function pexelsVideo(query:string,outputBase:string,seed:number,portrait:boolean):Promise<{path:string;credit:MediaCredit}|null>{
  const key=process.env.PEXELS_API_KEY;if(!key)return null;
  for(const search of providerQueries(query)){try{const maxSize=process.env.VERCEL?18_000_000:45_000_000,params=new URLSearchParams({query:search,orientation:portrait?"portrait":"landscape",size:"medium",per_page:"20"}),response=await fetch(`https://api.pexels.com/v1/videos/search?${params}`,{headers:{Authorization:key},signal:AbortSignal.timeout(process.env.VERCEL?4500:10000)});if(!response.ok)continue;const data=await response.json(),videos=(data.videos??[]).filter((video:any)=>(video.video_files??[]).some((file:any)=>file.link&&file.width>=640)),video=videos[seed%Math.max(1,videos.length)];if(!video)continue;const files=(video.video_files??[]).filter((file:any)=>file.link&&file.width>=640&&file.file_type==="video/mp4"&&Number(file.size||0)<=maxSize).sort((a:any,b:any)=>Math.abs((a.width||0)-1280)-Math.abs((b.width||0)-1280)),selected=files[0];if(!selected)continue;const media=await fetch(selected.link,{signal:AbortSignal.timeout(process.env.VERCEL?9000:25000)});if(!media.ok)continue;const bytes=Buffer.from(await media.arrayBuffer());if(!bytes.length||bytes.length>maxSize)continue;const path=`${outputBase}.mp4`;await writeFile(path,bytes);return{path,credit:{title:`${search} video`,source:video.url,artist:video.user?.name||"Pexels contributor",license:"Pexels License"}}}catch{continue}}return null
}
function isRelevant(query: string, page: any, info: any) {
  const ignored = new Set([
    "india",
    "indian",
    "ancient",
    "historic",
    "historical",
    "culture",
    "heritage",
    "illustration",
    "painting",
    "video",
  ]);
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3 && !ignored.has(term));
  if (!terms.length) return true;
  const metadata = info?.extmetadata ?? {};
  const haystack = [
    page?.title,
    metadata.ObjectName?.value,
    metadata.ImageDescription?.value,
    metadata.Categories?.value,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  return terms.some((term) => haystack.includes(term.slice(0, 6)));
}
async function commonsImage(
  query: string,
  output: string,
  seed = 0,
  used = new Set<string>(),
): Promise<MediaCredit | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `${query} filetype:bitmap`,
      gsrnamespace: "6",
      gsrlimit: "20",
      prop: "imageinfo",
      iiprop: "url|extmetadata|size",
      iiurlwidth: "1920",
      origin: "*",
    });
    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params}`,
      {
        headers: {
          "user-agent": "DrishyanaAI/0.1 (local educational renderer)",
        },
        signal: AbortSignal.timeout(process.env.VERCEL ? 7000 : 12000),
      },
    );
    if (!response.ok) return null;
    const data = await response.json(),
      pages = Object.values(data?.query?.pages ?? {}) as any[],
      usable = pages.filter(
        (p) =>
          p.imageinfo?.[0]?.thumburl &&
          Math.max(Number(p.imageinfo[0].width??0),Number(p.imageinfo[0].height??0))>=1200 &&
          !used.has(p.imageinfo[0].descriptionurl) &&
          isRelevant(query, p, p.imageinfo[0]),
      );
    const page = usable[seed % Math.max(1, usable.length)];
    if (!page) return null;
    const info = page.imageinfo[0],
      image = await fetch(info.thumburl, {
        headers: { "user-agent": "DrishyanaAI/0.1" },
        signal: AbortSignal.timeout(process.env.VERCEL ? 10000 : 20000),
      });
    if (!image.ok) return null;
    await writeFile(output, Buffer.from(await image.arrayBuffer()));
    used.add(info.descriptionurl);
    return {
      title: page.title,
      source: info.descriptionurl,
      artist:
        info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "") ||
        "Wikimedia contributor",
      license: info.extmetadata?.LicenseShortName?.value || "See source",
    };
  } catch {
    return null;
  }
}
async function openverseImage(query:string,output:string,seed=0,used=new Set<string>()):Promise<MediaCredit|null>{try{
 const params=new URLSearchParams({q:query,page_size:"30",mature:"false",license_type:"commercial",size:"large"}),response=await fetch(`https://api.openverse.org/v1/images/?${params}`,{headers:{"user-agent":"DrishyanaAI/0.3"},signal:AbortSignal.timeout(process.env.VERCEL?7000:12000)});if(!response.ok)return null;
 const data=await response.json(),terms=query.toLowerCase().split(/[^a-z0-9]+/).filter(term=>term.length>3),score=(item:any)=>{const text=[item.title,...(item.tags??[]).map((tag:any)=>tag.name)].filter(Boolean).join(" ").toLowerCase();return terms.reduce((total,term)=>total+(text.includes(term)?1:0),0)},results=(data.results??[]).filter((item:any)=>(item.url||item.thumbnail)&&Math.max(Number(item.width??0),Number(item.height??0))>=1200&&!used.has(item.foreign_landing_url||item.url)).sort((a:any,b:any)=>score(b)-score(a));
 const pool=results.slice(0,Math.min(10,results.length)),selected=pool[seed%Math.max(1,pool.length)];if(!selected)return null;
 let image=await fetch(selected.url||selected.thumbnail,{headers:{"user-agent":"DrishyanaAI/0.3"},signal:AbortSignal.timeout(process.env.VERCEL?10000:20000)});if(!image.ok)image=await fetch(selected.thumbnail,{headers:{"user-agent":"DrishyanaAI/0.3"},signal:AbortSignal.timeout(process.env.VERCEL?7000:15000)});if(!image.ok)return null;const bytes=Buffer.from(await image.arrayBuffer());if(!bytes.length||bytes.length>20_000_000)return null;
 await writeFile(output,bytes);used.add(selected.foreign_landing_url||selected.url);return{title:selected.title||query,source:selected.foreign_landing_url||selected.url,artist:selected.creator||"Openverse contributor",license:selected.license?.toUpperCase()||"Open license"}
 }catch{return null}}
async function huggingFaceImage(query:string,scene:string,output:string,seed:number,portrait:boolean):Promise<MediaCredit|null>{
  const key=hfApiKey();if(!key)return null;
  const model=process.env.HF_IMAGE_MODEL||"black-forest-labs/FLUX.1-schnell";
  try{
    const subject=visualEnglishText(query,seed).slice(0,180);
    const context=visualEnglishText(scene,seed+1);
    const prompt=`${subject}. ${context}. Cinematic documentary frame, realistic high quality, rich detail, full screen composition, natural light, culturally accurate Indian visuals where relevant. No text, no watermark, no logo.`;
    const response=await fetch(`https://api-inference.huggingface.co/models/${model}`,{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json",accept:"image/png"},body:JSON.stringify({inputs:prompt,parameters:{negative_prompt:"text, watermark, logo, blurry, low quality, distorted",width:portrait?768:1024,height:portrait?1024:576,num_inference_steps:process.env.VERCEL?12:14,guidance_scale:7,seed},options:{wait_for_model:false}}),signal:AbortSignal.timeout(process.env.VERCEL?6_000:8_000)});
    if(!response.ok)return null;
    const type=response.headers.get("content-type")||"";
    if(!type.startsWith("image/"))return null;
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.length||bytes.length>24_000_000)return null;
    await writeFile(output,bytes);
    return{title:subject,source:`Hugging Face image generation (${model})`,artist:"Generated image",license:"Generated visual"}
  }catch{return null}
}
async function generatedSceneImage(query:string,scene:string,output:string,seed:number,portrait:boolean):Promise<MediaCredit|null>{
  try{
    const subject=query.replace(/[^a-zA-Z0-9 ,.-]/g," ").replace(/\s+/g," ").trim().slice(0,140)||"cinematic story scene";
    const mood=/\b(ai|artificial intelligence|technology|digital|robot)\b/i.test(subject)?"futuristic AI technology, cinematic lighting, premium editorial still":"cinematic documentary, rich realistic detail, high quality, natural light";
    const prompt=`${subject}. ${mood}. Scene context: ${scene.replace(/[^a-zA-Z0-9 ,.-]/g," ").replace(/\s+/g," ").trim().slice(0,240)}. No text, no watermark, full screen composition`;
    const params=new URLSearchParams({width:portrait?"720":"1280",height:portrait?"1280":"720",seed:String(seed),model:"flux",nologo:"true",enhance:"true"});
    const response=await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`,{headers:{"accept":"image/*","user-agent":"DrishyanaAI/0.4"},signal:AbortSignal.timeout(process.env.VERCEL?22000:45000)});
    if(!response.ok)return null;
    const type=response.headers.get("content-type")||"";
    if(!type.startsWith("image/"))return null;
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.length||bytes.length>18_000_000)return null;
    await writeFile(output,bytes);
    return{title:subject,source:"Pollinations AI image generation",artist:"Generated image",license:"Generated visual"}
  }catch{return null}
}
async function commonsVideo(
  query: string,
  outputBase: string,
  seed = 0,
): Promise<{ path: string; credit: MediaCredit } | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `${query} filetype:video`,
      gsrnamespace: "6",
      gsrlimit: "12",
      prop: "videoinfo",
      viprop: "url|extmetadata|derivatives|size",
      origin: "*",
    });
    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params}`,
      {
        headers: {
          "user-agent": "DrishyanaAI/0.1 (local educational renderer)",
        },
        signal: AbortSignal.timeout(process.env.VERCEL ? 7000 : 12000),
      },
    );
    if (!response.ok) return null;
    const data = await response.json(),
      pages = Object.values(data?.query?.pages ?? {}) as any[];
    const usable = pages.flatMap((page) => {
      const info = page.videoinfo?.[0];
      if (!info || !isRelevant(query, page, info)) return [];
      const derivatives = (info.derivatives ?? [])
        .filter(
          (d: any) =>
            /\.(mp4|webm)(?:\?|$)/i.test(d.src ?? "") &&
            Math.max(Number(d.width ?? 0), Number(d.height ?? 0)) >= 720,
        )
        .sort(
          (a: any, b: any) =>
            Math.abs(Math.max(Number(a.width), Number(a.height)) - 720) -
            Math.abs(Math.max(Number(b.width), Number(b.height)) - 720),
        );
      const src =
        derivatives[0]?.src ||
        (Number(info.size ?? 0) <= 40_000_000 &&
        /\.(mp4|webm)(?:\?|$)/i.test(info.url ?? "")
          ? info.url
          : null);
      return src ? [{ page, info, src }] : [];
    });
    const selected = usable[seed % Math.max(1, usable.length)];
    if (!selected) return null;
    const ext = /\.mp4(?:\?|$)/i.test(selected.src) ? "mp4" : "webm",
      path = `${outputBase}.${ext}`,
      video = await fetch(selected.src, {
        headers: { "user-agent": "DrishyanaAI/0.1" },
        signal: AbortSignal.timeout(process.env.VERCEL ? 15000 : 30000),
      });
    if (
      !video.ok ||
      Number(video.headers.get("content-length") || 0) > 40_000_000
    )
      return null;
    const bytes = Buffer.from(await video.arrayBuffer());
    if (bytes.length > 40_000_000) return null;
    await writeFile(path, bytes);
    return {
      path,
      credit: {
        title: selected.page.title,
        source: selected.info.descriptionurl,
        artist:
          selected.info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "") ||
          "Wikimedia contributor",
        license:
          selected.info.extmetadata?.LicenseShortName?.value || "See source",
      },
    };
  } catch {
    return null;
  }
}
function subjectSeed(subject: string) {
  let hash = 2166136261;
  for (const char of subject) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}
function rasterSlide(index: number, w: number, h: number, style = "royal", subject = "") {
  const palettes: Record<string, number[][][]> = {
    royal: [
      [
        [22, 16, 34],
        [117, 70, 223],
      ],
      [
        [16, 34, 56],
        [29, 165, 198],
      ],
      [
        [42, 20, 41],
        [220, 92, 157],
      ],
      [
        [40, 24, 14],
        [230, 135, 57],
      ],
    ],
    heritage: [
      [
        [38, 18, 8],
        [175, 91, 25],
      ],
      [
        [52, 35, 11],
        [210, 157, 55],
      ],
      [
        [30, 14, 22],
        [138, 45, 61],
      ],
    ],
    minimal: [
      [
        [20, 24, 31],
        [61, 69, 83],
      ],
      [
        [16, 40, 45],
        [42, 113, 121],
      ],
      [
        [34, 28, 47],
        [92, 70, 125],
      ],
    ],
    aurora: [
      [[8, 24, 45], [39, 202, 181]],
      [[35, 16, 66], [180, 79, 218]],
      [[12, 42, 67], [57, 132, 255]],
    ],
    cinematic: [
      [[13, 12, 14], [181, 116, 35]],
      [[28, 18, 13], [232, 172, 72]],
      [[11, 18, 28], [162, 102, 33]],
    ],
  };
  const set = palettes[style] ?? palettes.royal,
    seed = subjectSeed(`${subject}-${index}`),
    colors = set[(index + seed) % set.length];
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = (x / w) * 0.65 + (y / h) * 0.35,
        p = (y * w + x) * 3;
      for (let c = 0; c < 3; c++)
        pixels[p + c] = Math.round(colors[0][c] * (1 - t) + colors[1][c] * t);
    }
  const paint = (x: number, y: number, color: number[]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = (Math.floor(y) * w + Math.floor(x)) * 3;
    pixels[p] = color[0];
    pixels[p + 1] = color[1];
    pixels[p + 2] = color[2];
  };
  const sunX = w * (0.16 + ((seed % 7) / 10)),
    sunY = h * (0.15 + ((seed >> 3) % 4) * 0.055),
    radius = Math.max(28, Math.min(w, h) * 0.065);
  for (let y = Math.max(0, sunY - radius); y < Math.min(h, sunY + radius); y++)
    for (
      let x = Math.max(0, sunX - radius);
      x < Math.min(w, sunX + radius);
      x++
    )
      if ((x - sunX) ** 2 + (y - sunY) ** 2 < radius ** 2)
        paint(x, y, [244, 190, 91]);
  const dark = [
    Math.max(5, colors[0][0] - 8),
    Math.max(5, colors[0][1] - 8),
    Math.max(8, colors[0][2] - 5),
  ];
  for (let x = 0; x < w; x++) {
    const ridge =
      h *
      (0.62 + 0.08 * Math.sin((x / w) * Math.PI * (2 + (index % 3)) + index));
    for (let y = ridge; y < h; y++) paint(x, y, dark);
  }
  const buildingX = w * (0.12 + ((seed >> 5) % 5) * 0.145),
    buildingW = w * 0.22,
    baseY = h * 0.72;
  for (let x = buildingX; x < buildingX + buildingW; x++)
    for (let y = baseY - h * 0.18; y < baseY; y++) paint(x, y, [24, 18, 30]);
  for (let tower = 0; tower < 3; tower++) {
    const tx = buildingX + (tower * buildingW) / 3,
      tw = buildingW / 5,
      top = baseY - h * (0.22 + (tower % 2) * 0.06);
    for (let x = tx; x < tx + tw; x++)
      for (let y = top; y < baseY; y++) paint(x, y, [24, 18, 30]);
  }
  const accent = [255, 218, 128];
  const lower = subject.toLowerCase();
  const drawCircle = (cx: number, cy: number, r: number, color: number[]) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r ** 2) paint(x, y, color);
  };
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: number[]) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) paint(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, color);
  };
  if (/ai|artificial|technology|digital|robot/.test(lower)) {
    for (let n = 0; n < 14; n++) {
      const cx = Math.floor(w * (0.18 + (((seed >> n) % 60) / 100)));
      const cy = Math.floor(h * (0.22 + (((seed >> (n + 4)) % 48) / 100)));
      drawCircle(cx, cy, Math.max(4, Math.floor(Math.min(w, h) * 0.008)), accent);
      if (n) drawLine(cx, cy, Math.floor(w * 0.5), Math.floor(h * 0.48), [120, 230, 255]);
    }
  } else if (/temple|ujjain|india|king|royal|heritage|history|vikram|shiva/.test(lower) || /[\u0C00-\u0C7F]/u.test(subject)) {
    const cx = Math.floor(w * 0.72), top = Math.floor(h * 0.3), bottom = Math.floor(h * 0.76);
    for (let level = 0; level < 5; level++) {
      const y = top + level * Math.floor((bottom - top) / 6), half = Math.floor(w * (0.04 + level * 0.018));
      for (let py = y; py < y + h * 0.045; py++) for (let px = cx - half; px < cx + half; px++) paint(px, py, [30, 20, 16]);
    }
    drawCircle(Math.floor(w * 0.2), Math.floor(h * 0.26), Math.floor(Math.min(w, h) * 0.045), [255, 185, 94]);
  } else {
    for (let n = 0; n < 9; n++) {
      const x = Math.floor(w * (0.12 + (((seed >> n) % 76) / 100)));
      const y = Math.floor(h * (0.2 + (((seed >> (n + 7)) % 56) / 100)));
      drawCircle(x, y, Math.max(8, Math.floor(Math.min(w, h) * 0.018)), [230, 235, 255]);
    }
  }
  return Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), pixels]);
}
async function duration(path: string) {
  try {
    const out = await new Promise<string>((resolve, reject) => {
      let s = "";
      const p = spawn(ffprobe.path, [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        path,
      ]);
      p.stdout.on("data", (d) => (s += d));
      p.on("close", (c) => (c === 0 ? resolve(s) : reject()));
    });
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RenderInput;
  const script = (body.script ?? "").trim();
  if (script.length < 10)
    return NextResponse.json(
      { error: "Please enter at least 10 characters." },
      { status: 400 },
    );
  const authorization = request.headers.get("authorization") ?? "";
  let account: any = null;
  if (authorization) {
    try {
      const response = await fetch(`${serverApiUrl()}/auth/me`, {
        headers: { authorization },
        cache: "no-store",
      });
      account = response.ok ? await response.json() : null;
    } catch {
      account = null;
    }
  }
  const hasRealPaidAccess = account?.role === "ADMIN" || account?.hasPaid === true;
  const hasCreatorCreditAccess = hasRealPaidAccess || Number(account?.credits ?? 0) > 0;
  let providers={pixabayImages:true,pexelsImages:true,openverseImages:false,huggingFaceImages:true,geminiVisualPrompts:false,geminiTts:true,relatedVideoClips:false};
  if(authorization){try{const response=await fetch(`${serverApiUrl()}/creator-tools/access`,{headers:{authorization},cache:"no-store"}),access=response.ok?await response.json():null;providers={...providers,...(access?.thirdParty??{})}}catch{}}
  if(account?.role==="ADMIN"&&body.providerOverrides)providers={...providers,...body.providerOverrides};
  if(process.env.VERCEL&&account?.role!=="ADMIN"){providers={...providers,openverseImages:false,geminiVisualPrompts:false,relatedVideoClips:false}}
  let showBranding=true;
  if(body.showBranding===false)showBranding=!hasRealPaidAccess;
  if (body.useRelatedVideos) {
    if (!authorization)
      return NextResponse.json(
        {
          error: "An approved payment is required to use related story videos.",
        },
        { status: 403 },
      );
      if (!hasRealPaidAccess)
        return NextResponse.json(
          {
            error:
              "Related story videos unlock after your first payment is approved by an admin.",
          },
          { status: 403 },
        );
  }
  const id = crypto.randomUUID(),
    startedAt = Date.now(),
    work = join(tmpdir(), `drishyana-${id}`),
    useBlob = Boolean(
      process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN,
    ),
    useCloudinary = hasCloudinaryStorage(),
    outputDir = useBlob || useCloudinary ? work : join(process.cwd(), "public", "renders");
  try {
    if (process.env.VERCEL && !useBlob && !useCloudinary)
      throw new Error(
        "Storage is not connected. Connect Vercel Blob or configure Cloudinary and redeploy.",
      );
    await mkdir(work, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    const title = (body.title ?? "").trim(),
      hasTitle = body.showTitleScreen !== false && !!title,
      narrationText = script,
      cleanNarrationText = narrationText.replace(/https?:\/\/\S+|www\.\S+/giu," ").replace(/[#*_~`^<>\[\]{}|\\/@©®™•▪■◆◇★☆✓✔✦✧]+/gu," ").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu," ").replace(/\s+/gu," ").trim();
    let narration = join(work, "narration.aiff");
    let hasAudio = false;
    let narrationFailure = "";
    let narrationSource = "";
    const telugu = /[\u0C00-\u0C7F]/u.test(cleanNarrationText);
    let voice = body.voice || (telugu ? "Padmavathi" : "Samantha");
    const voiceProvider=(process.env.VOICE_PROVIDER||"piper").toLowerCase();
    const kokoroOnly=voiceProvider==="kokoro"||voiceProvider==="kokoto";
    const piperOnly=voiceProvider==="piper"||voiceProvider==="local";
    const canUseKokoroVoice = hasCreatorCreditAccess && !!hfApiKey() && !!process.env.KOKORO_TTS_MODEL;
    const canUseGeminiVoice = voiceProvider==="gemini" && hasCreatorCreditAccess && (providers.geminiTts || (telugu && process.env.VERCEL)) && !!geminiApiKey();
    const rate = Math.max(110, Math.min(220, body.speed ?? 155));
    const root = join(process.cwd(), "../.."),
      piper = join(root, ".venv", "bin", "piper"),
      modelName =
        voice === "Venkatesh"
          ? "te_IN-venkatesh-medium"
          : "te_IN-padmavathi-medium",
      model = join(root, "models", "piper", `${modelName}.onnx`);
    if (body.uploadedVoiceUrl) {
      const uploaded=join(work,"own-voice.audio");
      if(/^https:\/\//i.test(body.uploadedVoiceUrl)){const response=await fetch(body.uploadedVoiceUrl,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error("Could not download the own-voice narration.");await writeFile(uploaded,Buffer.from(await response.arrayBuffer()))}
      else {const local=join(process.cwd(),"public","uploads","voices",body.uploadedVoiceUrl.split("/").pop()!);if(!existsSync(local))throw new Error("Own-voice narration was not found.");await writeFile(uploaded,await readFile(local))}
      narration=uploaded;voice="Own voice";hasAudio=true;narrationSource="uploaded voice";
    } else if (telugu && existsSync(piper) && existsSync(model)) {
      try {
        narration = await piperTts(cleanNarrationText,piper,model,work);
        hasAudio = true;
        narrationSource = "local Piper Telugu";
        narrationFailure = "";
      } catch (error) {
        hasAudio = false;
        narrationFailure = error instanceof Error ? error.message : "Piper narration failed";
      }
    } else if (!piperOnly && process.platform !== "darwin" && canUseKokoroVoice) {
      try {
        const kokoroNarration = await kokoroTts(cleanNarrationText, voice, telugu, work);
        if (kokoroNarration) {
          narration = kokoroNarration;
          hasAudio = true;
          narrationSource = "Kokoro TTS";
          narrationFailure = "";
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Kokoro TTS failed";
        narrationFailure = message === "fetch failed"
          ? "Kokoro TTS could not be reached from this server. Video was created without narration."
          : message;
      }
    } else if (!piperOnly && process.platform !== "darwin" && canUseGeminiVoice) {
      try {
        const geminiNarration = await geminiTts(cleanNarrationText, voice, telugu, work);
        if (geminiNarration) {
          narration = geminiNarration;
          hasAudio = true;
          narrationSource = "Gemini TTS";
          narrationFailure = "";
        }
      } catch (error) {
        narrationFailure = error instanceof Error ? error.message : "Gemini TTS failed";
      }
    } else if (telugu && process.platform === "darwin") {
      narrationFailure = !existsSync(piper) ? `Piper executable not found at ${piper}` : `Piper voice model not found at ${model}`;
    } else if (telugu) {
      narrationFailure = piperOnly
        ? `Local Telugu Piper TTS is selected, but missing ${!existsSync(piper)?piper:model}. Run npm run setup:telugu-tts.`
        : kokoroOnly
        ? "Kokoro TTS is selected, but HF_API_KEY or KOKORO_TTS_MODEL is missing."
        : geminiApiKey()
        ? "Online Telugu voice is disabled by provider/account settings."
        : "Online Telugu voice needs GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GOOGLE_AI_API_KEY on the render service.";
    }
    if (!hasAudio && canUseGeminiVoice) {
      try {
        const geminiNarration = await geminiTts(cleanNarrationText, voice, telugu, work);
        if (geminiNarration) {
          narration = geminiNarration;
          hasAudio = true;
          narrationSource = "Gemini TTS";
          narrationFailure = "";
        }
      } catch (error) {
        narrationFailure = error instanceof Error ? error.message : "Gemini TTS failed";
      }
    }
    if (!hasAudio && !telugu && process.platform === "darwin") {
      try {
        await run("/usr/bin/say", [
          "-v",
          voice.startsWith("Child") ? "Samantha" : voice,
          "-r",
          String(rate),
          "-o",
          narration,
          cleanNarrationText,
        ]);
        hasAudio = true;
        narrationSource = "macOS voice";
      } catch {
        hasAudio = false;
      }
    }
    if (!hasAudio && !narrationFailure && process.platform !== "darwin") {
      narrationFailure = geminiApiKey()
        ? "Server TTS failed or is disabled for this account."
        : "No server voice is configured. Add GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GOOGLE_AI_API_KEY to the render service, or upload an own-voice narration.";
    }
    if(hasAudio&&voice.startsWith("Child")){
      const childNarration=join(work,"narration-child.wav");
      await run(ffmpeg.path,["-i",narration,"-filter:a","aresample=44100,asetrate=51000,aresample=44100,atempo=0.92","-ac","1","-y",childNarration]);
      narration=childNarration;
    }
    const scriptLength = [...script].length,
      quickScript = scriptLength <= 180,
      shortScript = scriptLength <= 450,
      storyScenes = compactScenes(
        scenesFrom(script),
        quickScript ? 1 : shortScript ? 2 : process.env.VERCEL ? 6 : 18,
      ),
      scenes = hasTitle
        ? [title, ...storyScenes]
        : [...storyScenes],
      audioDuration = hasAudio ? await duration(narration) : 0;
    const weights = scenes.map((s, i) =>
        hasTitle && i === 0
          ? Math.max(55, [...s].length)
          : Math.max(30, [...s].length),
      ),
      weightTotal = weights.reduce((a, b) => a + b, 0);
    let sceneDurations = weights.map((weight, index) =>
      hasTitle && index === 0
        ? Math.min(10, Math.max(4, process.env.VERCEL ? 5 : 7))
        : hasAudio
        ? process.env.VERCEL
          ? Math.max(2.2, Math.min(7, ((audioDuration + 0.8) * weight) / weightTotal))
          : Math.max(2.8, ((audioDuration + 0.8) * weight) / weightTotal)
        : process.env.VERCEL
          ? Math.max(2.6, Math.min(5.5, weight / 16))
          : Math.max(3.5, weight / 13),
    );
    const fastOnlineTelugu = process.env.VERCEL && telugu && quickScript;
    const ctaSceneIndexes = new Set<number>();
    if (body.showEngagementCta !== false && !fastOnlineTelugu) {
      ctaSceneIndexes.add(scenes.length);
      scenes.push("Enjoyed this story?\nSubscribe for more thoughtful videos.");
      sceneDurations.push(process.env.VERCEL ? 2.4 : 3);
      if (!quickScript) {
        ctaSceneIndexes.add(scenes.length);
        scenes.push("Share this with someone who loves meaningful stories.");
        sceneDurations.push(process.env.VERCEL ? 3 : 4);
      }
    }
    const portrait = body.format === "9:16",
      square = body.format === "1:1",
      renderFps = process.env.VERCEL ? 10 : 24;
    const [w, h] = portrait ? [720, 1280] : square ? [1080, 1080] : [1280, 720];
    const uploaded = (body.uploadedMediaUrls ?? [])
      .filter((v) => v.startsWith("/uploads/media/"))
      .map((v) =>
        join(process.cwd(), "public", "uploads", "media", v.split("/").pop()!),
      )
      .filter(existsSync);
    const slides: string[] = [];
    const captions: string[] = [];
    const credits: MediaCredit[] = [];
    const downloadedImages: string[] = [];
    const usedImages = new Set<string>();
    let relatedVideosUsed = 0,
      imageDownloads = 0;
    const randomOffset = Math.floor(Math.random() * 1000),
      globalKeywords = scriptKeywords(title, script),
      promptLimit = !hasRealPaidAccess || !providers.geminiVisualPrompts || shortScript ? 0 : process.env.VERCEL ? 4 : 8,
      mediaDeadline = Date.now() + (quickScript ? process.env.VERCEL ? 4_500 : 16_000 : shortScript ? process.env.VERCEL ? 7_000 : 24_000 : process.env.VERCEL ? 25_000 : 75_000);
    const promptPlans = await Promise.all(
      scenes.slice(0, Math.min(scenes.length, promptLimit)).map(async (scene, i) => {
        const sceneImageQuery = mediaQuery(scene, i),
          sceneVideoQuery = videoQuery(scene, title, i),
          imageContext = titleContextQuery(title, i, "image"),
          videoContext = titleContextQuery(title, i, "video"),
          keywordContext = globalKeywords[i % Math.max(1, globalKeywords.length)] ?? "",
          fallbackImage = `${keywordContext} ${imageContext || title.trim()} ${sceneImageQuery}`.trim(),
          fallbackVideo = `${keywordContext} ${videoContext || title.trim()} ${sceneVideoQuery}`.trim();
        const prompts = await visualPrompts(title, scene, fallbackImage, fallbackVideo);
        return { sceneImageQuery, sceneVideoQuery, keywordContext, imageSearch: prompts.image, clipSearch: prompts.video };
      }),
    );
    const mediaStartedAt = Date.now();
    for (let i = 0; i < scenes.length; i++) {
      let path = body.templateOnly && uploaded.length ? uploaded[i % uploaded.length] : i < uploaded.length ? uploaded[i] : undefined;
      if (!path) {
        path = join(work, `scene-${i}.ppm`);
        if (!ctaSceneIndexes.has(i)) {
        const fallback = path,
          plan = promptPlans[i],
          sceneImageQuery = plan?.sceneImageQuery ?? mediaQuery(scenes[i], i),
          sceneVideoQuery = plan?.sceneVideoQuery ?? videoQuery(scenes[i], title, i),
          keywordContext = plan?.keywordContext ?? (globalKeywords[i % Math.max(1, globalKeywords.length)] ?? ""),
          imageSearch = plan?.imageSearch ?? `${keywordContext} ${title.trim()} ${sceneImageQuery}`.trim(),
          clipSearch = plan?.clipSearch ?? `${keywordContext} ${title.trim()} ${sceneVideoQuery}`.trim(),
          storyIndex = i - (hasTitle ? 1 : 0),
          maxRelatedVideos=process.env.VERCEL?1:Math.min(3,Math.ceil(storyScenes.length/4)),
          middleStart=Math.max(0,Math.floor(storyScenes.length*.25)),
          middleEnd=Math.max(middleStart,Math.ceil(storyScenes.length*.85)),
          tryVideo =
            !!body.useRelatedVideos &&
            providers.relatedVideoClips &&
            !shortScript &&
            Date.now() < mediaDeadline &&
            storyIndex >= 0 &&
            storyIndex >= middleStart &&
            storyIndex <= middleEnd &&
            relatedVideosUsed < maxRelatedVideos &&
            (storyIndex - middleStart) % 2 === 0;
        if (tryVideo) {
          let result = (providers.pixabayImages?await pixabayVideo(clipSearch,join(work,`related-video-${relatedVideosUsed}`),randomOffset+i,portrait):null)??(providers.pexelsImages?await pexelsVideo(clipSearch,join(work,`related-video-${relatedVideosUsed}`),randomOffset+i,portrait):null);
          if(!result&&clipSearch!==sceneVideoQuery)result=(providers.pixabayImages?await pixabayVideo(`${keywordContext} ${sceneVideoQuery}`,join(work,`related-video-${relatedVideosUsed}`),randomOffset+i+21,portrait):null)??(providers.pexelsImages?await pexelsVideo(`${keywordContext} ${sceneVideoQuery}`,join(work,`related-video-${relatedVideosUsed}`),randomOffset+i+21,portrait):null);
          if (result) {
            path = result.path;
            credits.push(result.credit);
            relatedVideosUsed++;
          }
        }
        if (
          path === fallback &&
          Date.now() < mediaDeadline &&
          imageDownloads < (quickScript ? Math.min(3, scenes.length) : shortScript ? Math.min(4, scenes.length) : process.env.VERCEL ? 6 : Math.min(14, scenes.length))
        ) {
          const candidate = join(work, `media-${imageDownloads}.jpg`);
          const canUseHuggingFaceImages=providers.huggingFaceImages&&(hasCreatorCreditAccess||(!process.env.VERCEL&&!!hfApiKey()));
          let credit = canUseHuggingFaceImages&&Date.now()<mediaDeadline?await huggingFaceImage(imageSearch,scenes[i],candidate,randomOffset+i+43,portrait):null;
          if(!credit&&Date.now()<mediaDeadline)credit=(providers.pixabayImages?await pixabayImage(imageSearch,candidate,randomOffset+i,portrait,usedImages):null)??(providers.pexelsImages?await pexelsImage(imageSearch,candidate,randomOffset+i,portrait,usedImages):null);
          if(!credit&&Date.now()<mediaDeadline&&imageSearch!==sceneImageQuery)credit=(canUseHuggingFaceImages?await huggingFaceImage(`${keywordContext} ${sceneImageQuery}`,scenes[i],candidate,randomOffset+i+47,portrait):null)??(providers.pixabayImages?await pixabayImage(`${keywordContext} ${sceneImageQuery}`,candidate,randomOffset+i+17,portrait,usedImages):null)??(providers.pexelsImages?await pexelsImage(`${keywordContext} ${sceneImageQuery}`,candidate,randomOffset+i+17,portrait,usedImages):null);
          if(!credit&&!shortScript&&providers.openverseImages&&Date.now()<mediaDeadline)credit=await openverseImage(imageSearch,candidate,randomOffset+i+31,usedImages);
          if(!credit&&!shortScript&&!process.env.VERCEL&&imageDownloads<3&&Date.now()<mediaDeadline)credit=await generatedSceneImage(imageSearch,scenes[i],candidate,randomOffset+i+53,portrait);
          imageDownloads++;
          if (credit) {
            path = candidate;
            downloadedImages.push(candidate);
            credits.push(credit);
          }
        }
        }
      }
      if (path.endsWith(".ppm") && downloadedImages.length && !ctaSceneIndexes.has(i)) {
        path = downloadedImages[i % downloadedImages.length];
      }
      const caption = join(work, `caption-${i}.txt`);
      if (path.endsWith(".ppm")) {
        await writeFile(path, rasterSlide(i, w, h, body.style, `${title} ${scenes[i]}`));
        credits.push({
          title: `Generated visual for ${title || "story scene"} ${i + 1}`,
          source: "Built-in scene-aware renderer",
          artist: "Drishyana AI",
          license: "Generated fallback",
        });
      }
      await writeFile(caption, wrap(scenes[i], w < h ? 22 : 34).join("\n"));
      slides.push(path);
      captions.push(caption);
    }
    const mediaMs = Date.now() - mediaStartedAt;
    const isVideo = (path: string) => /\.(mp4|mov|webm)$/i.test(path);
    const output = join(outputDir, `${id}.mp4`),
      args: string[] = [];
    slides.forEach((path, i) =>
      isVideo(path)
        ? args.push(
            "-stream_loop",
            "-1",
            "-t",
            String(sceneDurations[i]),
            "-i",
            path,
          )
        : args.push("-loop", "1", "-t", String(sceneDurations[i]), "-i", path),
    );
    if (hasAudio) args.push("-i", narration);
    let music="";
    const requestedMusicUrl=body.backgroundMusicUrl&&body.backgroundMusicUrl!==body.uploadedVoiceUrl?body.backgroundMusicUrl:"";
    if(requestedMusicUrl){music=join(work,`background-music${requestedMusicUrl.match(/\.[a-z0-9]+(?:\?|$)/i)?.[0]?.replace("?","")||".audio"}`);if(/^https:\/\//i.test(requestedMusicUrl)){const response=await fetch(requestedMusicUrl,{signal:AbortSignal.timeout(30000)});if(response.ok)await writeFile(music,Buffer.from(await response.arrayBuffer()))}else if(requestedMusicUrl.startsWith("/uploads/voices/")){const local=join(process.cwd(),"public","uploads","voices",requestedMusicUrl.split("/").pop()!);if(existsSync(local))await writeFile(music,await readFile(local))}}
    const hasUploadedMusic = !!music && existsSync(music), musicPreset=fastOnlineTelugu&&!hasUploadedMusic?undefined:body.backgroundMusicPreset, hasMusic=hasUploadedMusic||!!musicPreset;
    if (hasUploadedMusic) args.push("-stream_loop","-1","-i",music);
    else if(musicPreset){const tone=musicPreset==="cinematic"?"0.10*sin(2*PI*110*t)+0.045*sin(2*PI*165*t)+0.025*sin(2*PI*220*t)":"0.07*sin(2*PI*196*t)+0.035*sin(2*PI*293.66*t)+0.02*sin(2*PI*392*t)";args.push("-f","lavfi","-i",`aevalsrc=${tone}:s=44100`)}
    const font = join(
        process.cwd(),
        "assets",
        "fonts",
        telugu ? "NotoSansTelugu.ttf" : "NotoSans.ttf",
      ),
      fontSize = {
        small: w < h ? 26 : 30,
        medium: w < h ? 36 : 40,
        large: w < h ? 46 : 50,
      }[body.captionSize ?? "small"],
      captionY = body.captionPosition === "top" ? "h*0.13" : "h-text_h-h*0.08",
      captionFilter =
        body.showCaptions === false
          ? ""
          : `,drawtext=fontfile='${font}':textfile='${captions[0]}':fontcolor=white:fontsize=${fontSize}:line_spacing=10:x=(w-text_w)/2:y=${captionY}:shadowcolor=black@0.9:shadowx=3:shadowy=3:borderw=1:bordercolor=black@0.35`;
    const filters = slides
      .map((_, i) => {
        const titleCard = hasTitle && i === 0,
          endCard = ctaSceneIndexes.has(i),
          centeredCard = titleCard || endCard,
          cap = centeredCard
            ? `,drawtext=fontfile='${font}':textfile='${captions[i]}':fontcolor=white:fontsize=${w < h ? 48 : 58}:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.9:shadowx=4:shadowy=4`
            : body.showCaptions === false
              ? ""
              : captionFilter.replace(captions[0], captions[i]);
        const branding=!showBranding?"":`,drawtext=fontfile='${font}':text='DRISHYANA AI  |  ${titleCard ? "PRESENTS" : endCard ? "THANK YOU" : `SCENE ${i + (hasTitle ? 0 : 1)}`}':fontcolor=white@0.75:fontsize=20:x=w*0.08:y=h*0.04`,frames=Math.max(1,Math.round(sceneDurations[i]*renderFps)),still=!isVideo(slides[i]),base=`scale=${w}:${h}:force_original_aspect_ratio=increase:in_range=auto:out_range=tv,crop=${w}:${h},setsar=1,eq=saturation=1.08:contrast=1.04,unsharp=5:5:0.35`,animation=fastOnlineTelugu?"none":body.imageAnimation,motion=!still||animation==="none"||!animation?base:animation==="zoom"?`scale=${Math.round(w*1.12)}:${Math.round(h*1.12)}:force_original_aspect_ratio=increase,crop=${Math.round(w*1.12)}:${Math.round(h*1.12)},zoompan=z='min(zoom+0.0012,1.16)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${renderFps},trim=duration=${sceneDurations[i]},setsar=1,eq=saturation=1.08:contrast=1.04,unsharp=5:5:0.35`:animation==="pan"?`scale=${Math.round(w*1.18)}:${Math.round(h*1.18)}:force_original_aspect_ratio=increase,crop=${Math.round(w*1.18)}:${Math.round(h*1.18)},zoompan=z=1.08:x='(iw-iw/zoom)*on/${frames}':y='(ih-ih/zoom)/2':d=1:s=${w}x${h}:fps=${renderFps},trim=duration=${sceneDurations[i]},setsar=1,eq=saturation=1.08:contrast=1.04,unsharp=5:5:0.35`:`${base},fade=t=in:st=0:d=0.7,fade=t=out:st=${Math.max(.8,sceneDurations[i]-.7)}:d=0.7`;
        return `[${i}:v]${motion},setsar=1,format=yuv420p${cap}${branding}[v${i}]`;
      })
      .join(";");
    const refs = slides.map((_, i) => `[v${i}]`).join("");
    const audioFilters:string[]=[];
    if(hasMusic){const musicIndex=slides.length+(hasAudio?1:0),volume=Math.max(0.02,Math.min(0.5,Number(body.backgroundMusicVolume??0.12)));audioFilters.push(`[${musicIndex}:a]volume=${volume}[bg]`);if(hasAudio)audioFilters.push(`[${slides.length}:a][bg]amix=inputs=2:duration=longest:dropout_transition=2[a]`)}
    args.push(
      "-filter_complex",
      `${filters};${refs}concat=n=${slides.length}:v=1:a=0,format=yuv420p[v]${audioFilters.length?`;${audioFilters.join(';')}`:''}`,
      "-map",
      "[v]",
    );
    if (hasAudio||hasMusic) {
      args.push(
        "-map",
        hasAudio&&hasMusic?"[a]":hasMusic?"[bg]":`${slides.length}:a`,
      );
      if (ctaSceneIndexes.size === 0) args.push("-shortest");
      args.push(
        "-c:a",
        "aac",
        "-b:a",
        "160k",
      );
    }
    if (ctaSceneIndexes.size > 0) {
      args.push("-t", String(sceneDurations.reduce((a, b) => a + b, 0).toFixed(2)));
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      process.env.VERCEL || scenes.length > 20 ? "ultrafast" : "veryfast",
      "-r",
      String(renderFps),
      "-movflags",
      "+faststart",
      "-y",
      output,
    );
    const ffmpegStartedAt = Date.now();
    await run(ffmpeg.path, args);
    const ffmpegMs = Date.now() - ffmpegStartedAt;
    let videoUrl = "";
    let storage: "Vercel Blob" | "Cloudinary" | "Local renders" = "Local renders";
    if (useBlob) {
      try {
        videoUrl = (
          await put(`renders/${id}.mp4`, await readFile(output), {
            access: "public",
            contentType: "video/mp4",
            addRandomSuffix: false,
          })
        ).url;
        storage = "Vercel Blob";
      } catch (error) {
        if (!useCloudinary) throw error;
      }
    }
    if (!videoUrl && useCloudinary) {
      videoUrl = await uploadCloudinaryVideo(output, id);
      storage = "Cloudinary";
    }
    if (!videoUrl) videoUrl = `/renders/${id}.mp4`;
    return NextResponse.json({
      id,
      url: videoUrl,
      storage,
      scenes: scenes.length,
      duration: Math.round(sceneDurations.reduce((a, b) => a + b, 0)),
      voice: hasAudio
        ? `${voice} (${narrationSource || "voice"})`
        : telugu && kokoroOnly
          ? `No narration — ${narrationFailure || "Kokoro TTS unavailable"}`
          : telugu
          ? `No narration — ${narrationFailure || "server Telugu voice unavailable"}`
          : `Narration failed — ${narrationFailure || "server voice unavailable"}`,
      language: telugu ? "Telugu" : "Auto",
      media: credits,
      relatedVideosUsed,
      timings: {
        totalMs: Date.now() - startedAt,
        mediaMs,
        ffmpegMs,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rendering failed" },
      { status: 500 },
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
