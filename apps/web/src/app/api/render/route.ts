import { NextRequest, NextResponse } from "next/server";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import ffprobe from "@ffprobe-installer/ffprobe";

export const runtime = "nodejs";
export const maxDuration = 300;

type RenderInput = {
  title?: string;
  creatorName?: string;
  organization?: string;
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
  imageAnimation?: "none" | "zoom" | "pan" | "fade";
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
type MediaCredit = {
  title: string;
  source: string;
  artist: string;
  license: string;
};
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
 const params=new URLSearchParams({q:query,page_size:"30",mature:"false",license_type:"commercial",size:"large"}),response=await fetch(`https://api.openverse.org/v1/images/?${params}`,{headers:{"user-agent":"DrishyanaAI/0.3"},signal:AbortSignal.timeout(12000)});if(!response.ok)return null;
 const data=await response.json(),terms=query.toLowerCase().split(/[^a-z0-9]+/).filter(term=>term.length>3),score=(item:any)=>{const text=[item.title,...(item.tags??[]).map((tag:any)=>tag.name)].filter(Boolean).join(" ").toLowerCase();return terms.reduce((total,term)=>total+(text.includes(term)?1:0),0)},results=(data.results??[]).filter((item:any)=>(item.url||item.thumbnail)&&Math.max(Number(item.width??0),Number(item.height??0))>=1200&&!used.has(item.foreign_landing_url||item.url)).sort((a:any,b:any)=>score(b)-score(a));
 const pool=results.slice(0,Math.min(10,results.length)),selected=pool[seed%Math.max(1,pool.length)];if(!selected)return null;
 let image=await fetch(selected.url||selected.thumbnail,{headers:{"user-agent":"DrishyanaAI/0.3"},signal:AbortSignal.timeout(20000)});if(!image.ok)image=await fetch(selected.thumbnail,{headers:{"user-agent":"DrishyanaAI/0.3"},signal:AbortSignal.timeout(15000)});if(!image.ok)return null;const bytes=Buffer.from(await image.arrayBuffer());if(!bytes.length||bytes.length>20_000_000)return null;
 await writeFile(output,bytes);used.add(selected.foreign_landing_url||selected.url);return{title:selected.title||query,source:selected.foreign_landing_url||selected.url,artist:selected.creator||"Openverse contributor",license:selected.license?.toUpperCase()||"Open license"}
 }catch{return null}}
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
        signal: AbortSignal.timeout(12000),
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
            Math.max(Number(d.width ?? 0), Number(d.height ?? 0)) >= 480,
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
        signal: AbortSignal.timeout(30000),
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
function rasterSlide(index: number, w: number, h: number, style = "royal") {
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
  };
  const set = palettes[style] ?? palettes.royal,
    colors = set[index % set.length];
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
  const sunX = w * (0.2 + (index % 5) * 0.14),
    sunY = h * (0.18 + (index % 3) * 0.05),
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
  const buildingX = w * (0.15 + (index % 4) * 0.18),
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
  let showBranding=true;
  if(body.showBranding===false){try{const authorization=request.headers.get("authorization")??"",apiUrl=process.env.API_URL??"https://drishyana-api.onrender.com/api/v1",response=await fetch(`${apiUrl}/auth/me`,{headers:{authorization},cache:"no-store"}),account=response.ok?await response.json():null;showBranding=!(account?.role==="ADMIN"||account?.hasPaid===true)}catch{showBranding=true}}
  if (body.useRelatedVideos) {
    const authorization = request.headers.get("authorization");
    if (!authorization)
      return NextResponse.json(
        {
          error: "An approved payment is required to use related story videos.",
        },
        { status: 403 },
      );
    try {
      const apiUrl = process.env.API_URL ?? "https://drishyana-api.onrender.com/api/v1",
        entitlement = await fetch(`${apiUrl}/auth/me`, {
          headers: { authorization },
          cache: "no-store",
        }),
        account = await entitlement.json();
      if (!entitlement.ok || (!account.hasPaid && account.role !== "ADMIN"))
        return NextResponse.json(
          {
            error:
              "Related story videos unlock after your first payment is approved by an admin.",
          },
          { status: 403 },
        );
    } catch {
      return NextResponse.json(
        {
          error:
            "Could not verify the premium media entitlement. Please ensure the API is running.",
        },
        { status: 503 },
      );
    }
  }
  const id = crypto.randomUUID(),
    work = join(tmpdir(), `drishyana-${id}`),
    publicDir = join(process.cwd(), "public", "renders");
  await mkdir(work, { recursive: true });
  await mkdir(publicDir, { recursive: true });
  try {
    const title = (body.title ?? "").trim(),
      titleDetails = [body.creatorName?.trim(), body.organization?.trim()]
        .filter(Boolean)
        .join(" • "),
      hasTitle = body.showTitleScreen !== false && !!title,
      narrationText = script,
      cleanNarrationText = narrationText.replace(/https?:\/\/\S+|www\.\S+/giu," ").replace(/[#*_~`^<>\[\]{}|\\/@©®™•▪■◆◇★☆✓✔✦✧]+/gu," ").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu," ").replace(/\s+/gu," ").trim();
    let narration = join(work, "narration.aiff");
    let hasAudio = false;
    let narrationFailure = "";
    const telugu = /[\u0C00-\u0C7F]/u.test(cleanNarrationText);
    let voice = body.voice || (telugu ? "Padmavathi" : "Samantha");
    const rate = Math.max(110, Math.min(220, body.speed ?? 155));
    const root = join(process.cwd(), "../.."),
      piper = join(root, ".venv", "bin", "piper"),
      modelName =
        voice === "Venkatesh"
          ? "te_IN-venkatesh-medium"
          : "te_IN-padmavathi-medium",
      model = join(root, "models", "piper", `${modelName}.onnx`);
    if (body.uploadedVoiceUrl?.startsWith("/uploads/voices/")) {
      const uploaded = join(
        process.cwd(),
        "public",
        "uploads",
        "voices",
        body.uploadedVoiceUrl.split("/").pop()!,
      );
      if (existsSync(uploaded)) {
        narration = uploaded;
        voice = "Your uploaded voice";
        hasAudio = true;
      }
    } else if (telugu && existsSync(piper) && existsSync(model)) {
      narration = join(work, "narration.wav");
      try {
        const chunks = narrationChunks(cleanNarrationText), files: string[] = [];
        for (let index = 0; index < chunks.length; index++) {
          const file = join(work, `narration-${String(index).padStart(3, "0")}.wav`);
          await runInput(piper,["--model",model,"--output_file",file],chunks[index]);
          if (!existsSync(file)) throw new Error(`Piper did not create narration chunk ${index + 1}`);
          files.push(file);
        }
        if (files.length === 1) narration = files[0];
        else {
          const args = files.flatMap(file => ["-i", file]), inputs = files.map((_, index) => `[${index}:a]`).join("");
          args.push("-filter_complex",`${inputs}concat=n=${files.length}:v=0:a=1[a]`,"-map","[a]","-ac","1","-ar","22050","-c:a","pcm_s16le","-y",narration);
          await run(ffmpeg.path,args);
        }
        hasAudio = true;
      } catch (error) {
        hasAudio = false;
        narrationFailure = error instanceof Error ? error.message : "Piper narration failed";
      }
    } else if (telugu) {
      narrationFailure = !existsSync(piper) ? `Piper executable not found at ${piper}` : `Piper voice model not found at ${model}`;
    } else if (!telugu && process.platform === "darwin") {
      try {
        await run("/usr/bin/say", [
          "-v",
          voice,
          "-r",
          String(rate),
          "-o",
          narration,
          cleanNarrationText,
        ]);
        hasAudio = true;
      } catch {
        hasAudio = false;
      }
    }
    const storyScenes = scenesFrom(script),
      scenes = hasTitle
        ? [`${title}${titleDetails ? `\n${titleDetails}` : ""}`, ...storyScenes]
        : storyScenes,
      audioDuration = hasAudio ? await duration(narration) : 0;
    const weights = scenes.map((s, i) =>
        hasTitle && i === 0
          ? Math.max(55, [...s].length)
          : Math.max(30, [...s].length),
      ),
      weightTotal = weights.reduce((a, b) => a + b, 0);
    const sceneDurations = weights.map((weight) =>
      hasAudio
        ? Math.max(2.8, ((audioDuration + 0.8) * weight) / weightTotal)
        : Math.max(3.5, weight / 13),
    );
    const portrait = body.format === "9:16",
      square = body.format === "1:1";
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
    const usedImages = new Set<string>();
    let relatedVideosUsed = 0,
      imageDownloads = 0;
    const randomOffset = Math.floor(Math.random() * 1000);
    for (let i = 0; i < scenes.length; i++) {
      let path = body.templateOnly && uploaded.length ? uploaded[i % uploaded.length] : i < uploaded.length ? uploaded[i] : undefined;
      if (!path) {
        path = join(work, `scene-${i}.ppm`);
        const fallback = path,
          sceneImageQuery = mediaQuery(scenes[i], i),
          sceneVideoQuery = videoQuery(scenes[i], title, i),
          imageSearch = titleContextQuery(title,i,"image") ?? `${title.trim()} ${sceneImageQuery}`.trim(),
          clipSearch = titleContextQuery(title,i,"video") ?? `${title.trim()} ${sceneVideoQuery}`.trim(),
          storyIndex = i - (hasTitle ? 1 : 0),
          maxRelatedVideos=Math.min(4,Math.ceil(storyScenes.length/3)),
          tryVideo =
            !!body.useRelatedVideos &&
            storyIndex >= 0 &&
            relatedVideosUsed < maxRelatedVideos &&
            storyIndex % 3 === 1;
        if (tryVideo) {
          let result = await commonsVideo(
            clipSearch,
            join(work, `related-video-${relatedVideosUsed}`),
            randomOffset + i,
          );
          if (result) {
            path = result.path;
            credits.push(result.credit);
            relatedVideosUsed++;
          }
        }
        if (path === fallback && imageDownloads < 20) {
          const candidate = join(work, `media-${imageDownloads}.jpg`);
          let credit = (await commonsImage(
              imageSearch,
              candidate,
              randomOffset + i,
              usedImages,
            )) ?? (await openverseImage(imageSearch,candidate,randomOffset+i,usedImages));
          if(!credit&&imageSearch!==sceneImageQuery)credit=(await commonsImage(sceneImageQuery,candidate,randomOffset+i+17,usedImages))??(await openverseImage(sceneImageQuery,candidate,randomOffset+i+17,usedImages));
          imageDownloads++;
          if (credit) {
            path = candidate;
            credits.push(credit);
          }
        }
      }
      const caption = join(work, `caption-${i}.txt`);
      if (path.endsWith(".ppm"))
        await writeFile(path, rasterSlide(i, w, h, body.style));
      await writeFile(caption, wrap(scenes[i], w < h ? 22 : 34).join("\n"));
      slides.push(path);
      captions.push(caption);
    }
    const isVideo = (path: string) => /\.(mp4|mov|webm)$/i.test(path);
    const output = join(publicDir, `${id}.mp4`),
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
    const music = body.backgroundMusicUrl?.startsWith("/uploads/voices/") ? join(process.cwd(),"public","uploads","voices",body.backgroundMusicUrl.split("/").pop()!) : "", hasUploadedMusic = !!music && existsSync(music), musicPreset=body.backgroundMusicPreset, hasMusic=hasUploadedMusic||!!musicPreset;
    if (hasUploadedMusic) args.push("-stream_loop","-1","-i",music);
    else if(musicPreset){const tone=musicPreset==="cinematic"?"0.10*sin(2*PI*110*t)+0.045*sin(2*PI*165*t)+0.025*sin(2*PI*220*t)":"0.07*sin(2*PI*196*t)+0.035*sin(2*PI*293.66*t)+0.02*sin(2*PI*392*t)";args.push("-f","lavfi","-i",`aevalsrc=${tone}:s=44100`)}
    const font = telugu
        ? "/System/Library/Fonts/KohinoorTelugu.ttc"
        : "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
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
          cap = titleCard
            ? `,drawtext=fontfile='${font}':textfile='${captions[i]}':fontcolor=white:fontsize=${w < h ? 48 : 58}:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.9:shadowx=4:shadowy=4`
            : body.showCaptions === false
              ? ""
              : captionFilter.replace(captions[0], captions[i]);
        const branding=!showBranding?"":`,drawtext=fontfile='/System/Library/Fonts/Supplemental/Arial Bold.ttf':text='DRISHYANA AI  |  ${titleCard ? "PRESENTS" : `SCENE ${i + (hasTitle ? 0 : 1)}`}':fontcolor=white@0.75:fontsize=20:x=w*0.08:y=h*0.04`,frames=Math.max(1,Math.round(sceneDurations[i]*24)),still=!isVideo(slides[i]),motion=!still||body.imageAnimation==="none"||!body.imageAnimation?`scale=${w}:${h}:force_original_aspect_ratio=increase:in_range=auto:out_range=tv,crop=${w}:${h}`:body.imageAnimation==="zoom"?`scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='min(zoom+0.0007,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=24`:body.imageAnimation==="pan"?`scale=${Math.round(w*1.12)}:${Math.round(h*1.12)}:force_original_aspect_ratio=increase,zoompan=z=1.08:x='(iw-iw/zoom)*on/${frames}':y='(ih-ih/zoom)/2':d=1:s=${w}x${h}:fps=24`:`scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fade=t=in:st=0:d=0.7,fade=t=out:st=${Math.max(.8,sceneDurations[i]-.7)}:d=0.7`;
        return `[${i}:v]${motion},setsar=1,format=yuv420p${cap}${branding}[v${i}]`;
      })
      .join(";");
    const refs = slides.map((_, i) => `[v${i}]`).join("");
    const audioFilters:string[]=[];
    if(hasMusic){const musicIndex=slides.length+(hasAudio?1:0),volume=Math.max(0.02,Math.min(0.5,Number(body.backgroundMusicVolume??0.12)));audioFilters.push(`[${musicIndex}:a]volume=${volume}[bg]`);if(hasAudio)audioFilters.push(`[${slides.length}:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]`)}
    args.push(
      "-filter_complex",
      `${filters};${refs}concat=n=${slides.length}:v=1:a=0,format=yuv420p[v]${audioFilters.length?`;${audioFilters.join(';')}`:''}`,
      "-map",
      "[v]",
    );
    if (hasAudio||hasMusic)
      args.push(
        "-map",
        hasAudio&&hasMusic?"[a]":`${slides.length}:a`,
        "-shortest",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
      );
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      scenes.length > 20 ? "ultrafast" : "veryfast",
      "-r",
      "24",
      "-movflags",
      "+faststart",
      "-y",
      output,
    );
    await run(ffmpeg.path, args);
    return NextResponse.json({
      id,
      url: `/renders/${id}.mp4`,
      scenes: scenes.length,
      duration: Math.round(sceneDurations.reduce((a, b) => a + b, 0)),
      voice: hasAudio
        ? `${voice} (local Piper)`
        : telugu
          ? `Telugu narration failed — ${narrationFailure || "unknown Piper error"}`
          : "Silent",
      language: telugu ? "Telugu" : "Auto",
      media: credits,
      relatedVideosUsed,
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
