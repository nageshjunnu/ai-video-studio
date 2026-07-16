"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession, session } from "@/lib/api";
import {
  House,
  SquaresFour,
  Images,
  MagicWand,
  ChartLineUp,
  UsersThree,
  CreditCard,
  Gear,
  MagnifyingGlass,
  Bell,
  Plus,
  Play,
  DotsThree,
  ArrowUpRight,
  Lightning,
  CheckCircle,
  Sparkle,
  CaretRight,
  UploadSimple,
  FileText,
  LinkSimple,
  List,
  X,
  Microphone,
} from "@phosphor-icons/react";

type ProjectCard = {
  id: string;
  title: string;
  type: string;
  time: string;
  date: string;
  progress: number;
  color: string;
  url?: string;
  status: string;
};
const nav = [
  { n: "Home", i: House },
  { n: "Create video", i: MagicWand },
  { n: "Projects", i: SquaresFour },
  { n: "Templates", i: Images },
  { n: "Analytics", i: ChartLineUp },
  { n: "Team", i: UsersThree },
  { n: "Billing", i: CreditCard },
  { n: "Creator tools", i: Microphone },
  { n: "My account", i: Gear },
  { n: "Notifications", i: Bell },
];
const actions = [
  {
    t: "Create from script",
    d: "Turn your words into scenes",
    i: FileText,
    c: "purple",
  },
  {
    t: "Create with AI",
    d: "Start with a simple prompt",
    i: Sparkle,
    c: "cyan",
  },
  {
    t: "Article to video",
    d: "Paste any article or URL",
    i: LinkSimple,
    c: "pink",
  },
  {
    t: "Upload voiceover",
    d: "Build around your audio",
    i: UploadSimple,
    c: "orange",
  },
];

export function Studio() {
  const router = useRouter();
  const [user, setUser] = useState<{
    fullName: string;
    email: string;
    credits: number;
    role: string;
    hasPaid: boolean;
  } | null>(null);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [heroPrompt,setHeroPrompt]=useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [step, setStep] = useState(1);
  const [script, setScript] = useState("");
  const [format, setFormat] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [voice, setVoice] = useState("Padmavathi");
  const [speed, setSpeed] = useState(180);
  const [style, setStyle] = useState("heritage");
  const [imageAnimation,setImageAnimation]=useState<"none"|"zoom"|"pan"|"fade">("zoom");
  const [ownVoice,setOwnVoice]=useState<{url:string;name:string}|null>(null);
  const [recordingNarration,setRecordingNarration]=useState(false);
  const [uploadingNarration,setUploadingNarration]=useState(false);
  const narrationRecorderRef=useRef<MediaRecorder|null>(null);
  const narrationStreamRef=useRef<MediaStream|null>(null);
  const [backgroundMusic,setBackgroundMusic]=useState<{url:string;name:string}|null>(null);
  const [backgroundMusicPreset,setBackgroundMusicPreset]=useState<""|"ambient"|"cinematic">("ambient");
  const [backgroundMusicEnabled,setBackgroundMusicEnabled]=useState(true);
  const [backgroundMusicVolume,setBackgroundMusicVolume]=useState(12);
  const [dictatingContent,setDictatingContent]=useState(false);
  const dictationRef=useRef<any>(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const [captionPosition, setCaptionPosition] = useState<"top" | "bottom">(
    "bottom",
  );
  const [captionSize, setCaptionSize] = useState<"small" | "medium" | "large">(
    "small",
  );
  const [showEngagementCta,setShowEngagementCta]=useState(true);
  const [uploadedMedia, setUploadedMedia] = useState<
    { url: string; name: string; type: string }[]
  >([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [useRelatedVideos, setUseRelatedVideos] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [showTitleScreen, setShowTitleScreen] = useState(true);
  const [videoCountry, setVideoCountry] = useState("GLOBAL");
  const [scriptTopic, setScriptTopic] = useState("");
  const [scriptLanguage, setScriptLanguage] = useState<"en" | "te">("en");
  const [generatingScript, setGeneratingScript] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const navItems = user?.role === "ADMIN"
    ? [...nav, { n: "Tool access", i: Gear }, { n: "User videos", i: Play }, { n: "Admin videos", i: List }]
    : nav.filter(item => item.n !== "Team");
  async function refreshDashboard() {
    try {
      const [data, allProjects] = await Promise.all([
        api<any>("/dashboard"),
        api<any[]>("/projects"),
      ]);
      const current = {
        ...data.user,
        email: session()?.user.email ?? "",
        role: session()?.user.role ?? "CUSTOMER",
      };
      setUser(current);
      if (current.hasPaid || current.role === "ADMIN")
        setUseRelatedVideos(true);
      setProjects(
        allProjects.map((p: any, i: number) => ({
          id: p.id,
          title: p.title,
          type: `${p.language === "te" ? "Telugu" : "Video"} · ${p.format}`,
          time: p.finalVideoUrl ? "Ready" : "—",
          date: `Updated ${new Date(p.updatedAt).toLocaleDateString()}`,
          progress: p.progress,
          color: ["violet", "orange", "blue"][i % 3],
          url: p.finalVideoUrl,
          status: p.status,
        })),
      );
    } finally {
      setDashboardLoading(false);
    }
  }
  useEffect(() => {
    if (!session()) {
      router.replace("/login");
      return;
    }
    refreshDashboard();
    api<any[]>("/templates").then(setTemplates).catch(() => {});
    api<any[]>("/notifications").then((rows) => setUnreadNotifications(rows.filter((row) => !row.readAt).length)).catch(() => {});
    try {
      const raw = localStorage.getItem("kathaforge_selected_template");
      if (raw) {
        const selected = JSON.parse(raw);
        setSelectedTemplate(selected);
        setStyle(selected.style || "heritage");
        if (selected.videoUrl)
          setUploadedMedia([
            {
              url: selected.videoUrl,
              name: selected.name || "Template clip",
              type: "video/mp4",
            },
          ]);
        setWizard(true);
        setStep(2);
        localStorage.removeItem("kathaforge_selected_template");
      }
    } catch {}
  }, []);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [video, setVideo] = useState<{
    url: string;
    scenes: number;
    duration: number;
    voice: string;
    media?: { title: string; source: string; license: string }[];
  } | null>(null);
  const [renderError, setRenderError] = useState("");
  const renderMessages=[
    "Reading your story and finding its strongest visual moments",
    "Matching every scene with high-quality story visuals",
    "Adding cinematic movement, depth and transitions",
    "Balancing narration, music and readable captions",
    "Polishing your video into a beautiful final cut",
  ];
  const renderStatus =
    elapsed < 15
      ? "Preparing your story and reserving credits"
      : elapsed < 35
        ? "Finding related visuals"
        : elapsed < 75
          ? "Building scenes and captions"
          : elapsed < 180
            ? "Encoding the final MP4"
            : "Still encoding. Keep this page open";
  const progressLabel =
    rendering
      ? `${progress}% complete`
      : "";
  async function createVideo() {
    if (!script.trim()) {
      setStep(2);
      setRenderError("Add a script before creating your video.");
      return;
    }
    setRendering(true);
    setRenderError("");
    setProgress(5);
    setElapsed(0);
    const started = Date.now();
    const estimatedSeconds = Math.max(35, Math.min(240, 25 + [...script].length / 24));
    let timer = window.setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(Math.floor(seconds));
      const softCap = seconds < estimatedSeconds ? 88 : seconds < estimatedSeconds * 1.35 ? 94 : 98;
      setProgress(Math.min(softCap, Math.round(5 + (seconds / estimatedSeconds) * 83)));
    }, 1000);
    let projectId = "";
    try {
      const project = await api<any>("/projects", {
        method: "POST",
        body: JSON.stringify({
          title: videoTitle || "My Story",
          script,
          voice,
          language: /[\u0C00-\u0C7F]/u.test(script) ? "te" : "en",
          format,
          country: videoCountry,
          template: style,
          subtitleSettings: { showCaptions, captionPosition, captionSize },
          mediaFiles: uploadedMedia,
        }),
      });
      projectId = project.id;
      const startedRender = await api<any>(
        `/projects/${projectId}/start-render`,
        { method: "POST" },
      );
      setUser((u) => (u ? { ...u, credits: startedRender.balance } : u));
      const token = session()?.accessToken;
      const response = await fetch("/api/render", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: videoTitle || "My Story",
          showTitleScreen,
          script,
          format,
          voice,
          speed,
          style,
          uploadedVoiceUrl: voice === "Own voice" ? ownVoice?.url : undefined,
          backgroundMusicUrl: backgroundMusicEnabled?backgroundMusic?.url:undefined,
          backgroundMusicPreset: backgroundMusicEnabled&&!backgroundMusic?backgroundMusicPreset||undefined:undefined,
          backgroundMusicVolume: backgroundMusicVolume/100,
          uploadedMediaUrls: selectedTemplate?.videoUrl
            ? [selectedTemplate.videoUrl]
            : uploadedMedia.map((m) => m.url),
          templateOnly: Boolean(selectedTemplate?.videoUrl),
          showCaptions,
          captionPosition,
          captionSize,
          useRelatedVideos,
          showBranding: !(user?.role === "ADMIN" || user?.hasPaid),
          showEngagementCta,
          imageAnimation,
        }),
      });
      const rawResponse = await response.text();
      let data: any;
      try {
        data = rawResponse ? JSON.parse(rawResponse) : {};
      } catch {
        const timedOut =
          response.status === 504 ||
          rawResponse.includes("FUNCTION_INVOCATION_TIMEOUT") ||
          rawResponse.includes("An error occurred with your deployment");
        data = {
          error: timedOut
            ? "Video rendering exceeded Vercel's 5-minute limit. Your reserved credits were refunded. Use a shorter script or deploy the background render worker."
            : rawResponse.slice(0, 500) || "Rendering service returned an invalid response.",
        };
      }
      if (!response.ok) throw new Error(data.error || "Rendering failed");
      await api(`/projects/${projectId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          url: data.url,
          duration: data.duration,
          scenes: data.scenes,
        }),
      });
      setVideo(data);
      setProgress(100);
      await refreshDashboard();
    } catch (error) {
      if (projectId)
        await api(`/projects/${projectId}/fail`, { method: "POST" }).catch(
          () => {},
        );
      setRenderError(
        error instanceof Error ? error.message : "Rendering failed",
      );
      await refreshDashboard().catch(() => {});
    } finally {
      window.clearInterval(timer);
      setRendering(false);
    }
  }
  function previewVoice(name:string){
    if(typeof window==="undefined"||!("speechSynthesis" in window))return;
    window.speechSynthesis.cancel();
    const telugu=name==="Padmavathi"||name==="Venkatesh"||name==="Child Telugu";
    const utterance=new SpeechSynthesisUtterance(telugu?"నమస్కారం. మీ కథను అందంగా వినిపిస్తాను.":"Hello. This is a preview of your story voice.");
    utterance.lang=telugu?"te-IN":"en-US";
    utterance.rate=Math.max(.7,Math.min(1.3,speed/180));
    utterance.pitch=name.includes("Child")?1.55:name==="Venkatesh"||name==="Daniel"?0.88:1;
    const voices=window.speechSynthesis.getVoices(),preferred=voices.find(item=>item.name.toLowerCase().includes(name.toLowerCase()))||voices.find(item=>item.lang.toLowerCase().startsWith(telugu?"te":"en"));
    if(preferred)utterance.voice=preferred;
    window.speechSynthesis.speak(utterance);
  }
  function toggleContentDictation(){
    if(dictatingContent){dictationRef.current?.stop();return}
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Recognition){setRenderError("Voice-to-content recording requires Chrome or Edge.");return}
    setRenderError("");
    const recognition=new Recognition(),startingText=script.trim();let committed="";
    recognition.lang=scriptLanguage==="te"?"te-IN":"en-IN";recognition.continuous=true;recognition.interimResults=true;
    recognition.onresult=(event:any)=>{let interim="";for(let index=event.resultIndex;index<event.results.length;index++){const value=event.results[index][0].transcript.trim();if(event.results[index].isFinal)committed+=`${committed?" ":""}${value}`;else interim+=`${interim?" ":""}${value}`}setScript([startingText,committed,interim].filter(Boolean).join(" "));setAiGenerated(false)};
    recognition.onerror=(event:any)=>setRenderError(`Voice recording stopped: ${event.error||"microphone error"}`);
    recognition.onend=()=>setDictatingContent(false);recognition.start();dictationRef.current=recognition;setDictatingContent(true);
  }
  async function uploadNarration(file?:File){
    if(!file)return;
    setUploadingNarration(true);setRenderError("");
    try{const form=new FormData();form.append("voice",file);const response=await fetch("/api/voice-upload",{method:"POST",body:form}),data=await response.json();if(!response.ok)throw new Error(data.error||"Narration upload failed");setOwnVoice(data);setVoice("Own voice")}
    catch(error){setRenderError(error instanceof Error?error.message:"Narration upload failed")}
    finally{setUploadingNarration(false)}
  }
  async function toggleNarrationRecording(){
    if(recordingNarration){narrationRecorderRef.current?.stop();return}
    if(!navigator.mediaDevices?.getUserMedia){setRenderError("Narration recording requires microphone access in Chrome, Edge, or Safari.");return}
    try{
      setRenderError("");const stream=await navigator.mediaDevices.getUserMedia({audio:true}),chunks:BlobPart[]=[];
      narrationStreamRef.current=stream;const recorder=new MediaRecorder(stream);narrationRecorderRef.current=recorder;
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
      recorder.onstop=async()=>{setRecordingNarration(false);stream.getTracks().forEach(track=>track.stop());narrationStreamRef.current=null;const type=recorder.mimeType||"audio/webm",extension=type.includes("ogg")?"ogg":type.includes("mp4")?"m4a":"webm";await uploadNarration(new File(chunks,`my-narration.${extension}`,{type}))};
      recorder.start();setRecordingNarration(true);
    }catch{setRenderError("Microphone permission was denied or no microphone is available.")}
  }
  async function uploadMusic(file?:File){if(!file)return;setRenderError("");try{const form=new FormData();form.append("voice",file);const response=await fetch("/api/voice-upload",{method:"POST",body:form}),data=await response.json();if(!response.ok)throw new Error(data.error||"Music upload failed");setBackgroundMusic(data);setBackgroundMusicPreset("")}catch(error){setRenderError(error instanceof Error?error.message:"Music upload failed")}}
  async function uploadMedia(files?: FileList) {
    if (!files?.length) return;
    setUploadingMedia(true);
    setRenderError("");
    try {
      const form = new FormData();
      Array.from(files)
        .slice(0, 12)
        .forEach((file) => form.append("media", file));
      const response = await fetch("/api/media-upload", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");
      setUploadedMedia((current) => [...current, ...data.files].slice(0, 12));
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingMedia(false);
    }
  }
  async function generateScript() {
    const subject = scriptTopic.trim() || videoTitle.trim();
    if (!subject) {
      setRenderError("Enter a title or topic before generating content.");
      return;
    }
    setGeneratingScript(true);
    setRenderError("");
    try {
      const r = await fetch("/api/script-generate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(session()?.accessToken ? { authorization: `Bearer ${session()?.accessToken}` } : {}),
          },
          body: JSON.stringify({
            topic: subject,
            language: scriptLanguage,
            action: "content",
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setVideoTitle(d.title);
      setScript(d.script);
      setAiGenerated(true);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingScript(false);
    }
  }
  async function generateTitle() {
    if (!script.trim() && !scriptTopic.trim()) {
      setRenderError("Add a topic or script before generating a title.");
      return;
    }
    setGeneratingScript(true);
    try {
      const r = await fetch("/api/script-generate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(session()?.accessToken ? { authorization: `Bearer ${session()?.accessToken}` } : {}),
          },
          body: JSON.stringify({
            topic: scriptTopic,
            content: script,
            language: scriptLanguage,
            action: "title",
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setVideoTitle(d.title);
      setAiGenerated(true);
    } catch (e) {
      setRenderError(
        e instanceof Error ? e.message : "Title generation failed",
      );
    } finally {
      setGeneratingScript(false);
    }
  }
  function closeAndResetWizard() {
    setWizard(false);
    setStep(1);
    setScript("");
    setFormat("16:9");
    setVoice("Padmavathi");
    setSpeed(180);
    setStyle("heritage");
    setImageAnimation("zoom");
    setOwnVoice(null);
    setRecordingNarration(false);
    setBackgroundMusic(null);
    setBackgroundMusicPreset("ambient");
    setBackgroundMusicEnabled(true);
    setBackgroundMusicVolume(12);
    setShowCaptions(true);
    setShowEngagementCta(true);
    setCaptionPosition("bottom");
    setCaptionSize("small");
    setUploadedMedia([]);
    setSelectedTemplate(null);
    setUseRelatedVideos(Boolean(user?.hasPaid || user?.role === "ADMIN"));
    setVideoTitle("");
    setShowTitleScreen(true);
    setVideoCountry("GLOBAL");
    setScriptTopic("");
    setScriptLanguage("en");
    setAiGenerated(false);
    setVideo(null);
    setRenderError("");
    setProgress(0);
    setElapsed(0);
  }
  return (
    <div className="shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="logo">
            <Play weight="fill" />
          </div>
          <span>Drishyana</span>
          <button className="close" onClick={() => setMobile(false)}>
            <X />
          </button>
        </div>
        <nav>
          {navItems.map(({ n, i: I }, idx) => (
            <button
              key={n}
              className={idx === 0 ? "active" : ""}
              onClick={() =>
                n === "Create video"
                  ? setWizard(true)
                  : n === "Projects"
                    ? router.push("/projects")
                    : n === "Templates"
                      ? router.push("/templates")
                      : n === "Analytics"
                        ? router.push("/analytics")
                        : n === "Billing"
                          ? router.push("/buy-credits")
                          : n === "Team"
                            ? router.push("/team")
                            : n === "Notifications"
                              ? router.push(user?.role === "ADMIN" ? "/admin/notifications" : "/notifications")
                              : n === "Creator tools"
                                ? router.push("/tools")
                                : n === "My account"
                                  ? router.push("/account")
                                : n === "Tool access"
                                  ? router.push("/admin/features")
                              : n === "User videos"
                                ? router.push("/admin/videos?scope=users")
                                : n === "Admin videos"
                                  ? router.push("/admin/videos?scope=admins")
                                  : undefined
              }
            >
              <I />
              <span>{n}</span>
              {n === "Projects" && <b>{projects.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade">
            <Sparkle />
            <strong>Need more credits?</strong>
            <p>1,000 credits are ₹10 in local test mode.</p>
            <button onClick={() => router.push("/buy-credits")}>
              Buy credits <ArrowUpRight />
            </button>
          </div>
          <button
            className="settings"
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
          >
            <Gear /> Logout
          </button>
          <div className="profile">
            <div className="avatar">
              {user?.fullName
                ?.split(" ")
                .map((v) => v[0])
                .join("")
                .slice(0, 2) || "KF"}
            </div>
            <div>
              <strong>{user?.fullName || "Loading…"}</strong>
              <small>{user?.email}</small>
            </div>
            <DotsThree />
          </div>
        </div>
      </aside>
      <main>
        <header>
          <button className="hamb" onClick={() => setMobile(true)}>
            <List />
          </button>
          <div className="search">
            <MagnifyingGlass />
            <input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search videos by title, language or format..." />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <div className="credits">
              <Lightning weight="fill" />{" "}
              {(user?.credits ?? 0).toLocaleString()} <span>credits</span>
            </div>
            <button className="icon-btn" onClick={() => router.push("/notifications")} aria-label="Notifications">
              <Bell />
              {unreadNotifications > 0 && <i />}
            </button>
            <button className="create" onClick={() => setWizard(true)}>
              <Plus weight="bold" /> Create video
            </button>
          </div>
        </header>
        <div className="content">
          <section className="welcome">
            <div>
              <p className="eyebrow">YOUR CREATOR DASHBOARD</p>
              <h1>
                Welcome, {user?.fullName?.split(" ")[0] || "creator"}{" "}
                <span>✦</span>
              </h1>
              <p>
                {projects.length
                  ? `You have ${projects.length} recent projects.`
                  : "Create your first cinematic story today."}
              </p>
            </div>
            <div className="streak">
              <div>
                <Lightning weight="fill" />
              </div>
              <div>
                <b>{(user?.credits ?? 0).toLocaleString()} credits</b>
                <small>Available balance</small>
              </div>
            </div>
          </section>
          <section className="hero">
            <div className="hero-copy">
              <div className="ai-pill">
                <Sparkle weight="fill" /> DRISHYANA STORY ENGINE
              </div>
              <h2>
                Give every voice
                <br />a <em>cinematic frame.</em>
              </h2>
              <p>
                Turn Telugu and English stories into narrated, visual
                videos—privately and locally.
              </p>
              <div className="prompt">
                <textarea value={heroPrompt} onChange={e=>setHeroPrompt(e.target.value)} placeholder="Paste your story, legend, lesson, article, or complete script here..." />
                <div>
                  <button>
                    <Plus />
                  </button>
                  <span>16:9</span>
                  <button className="generate" onClick={() => {if(heroPrompt.trim())setScript(heroPrompt.trim());setStep(1);setWizard(true)}}>
                    <Sparkle weight="fill" /> Frame my story <CaretRight />
                  </button>
                </div>
              </div>
              <div className="suggestions">
                <span>Try:</span>
                <button>Telugu legend</button>
                <button>History story</button>
                <button>Social short</button>
              </div>
            </div>
            <div className="hero-art">
              <div className="orb orb1" />
              <div className="orb orb2" />
              <div className="frame f1">
                <span>SCENE 01</span>
                <div className="mountains">✦</div>
              </div>
              <div className="frame f2">
                <Play weight="fill" />
                <span>Story framed</span>
              </div>
              <div className="float-badge">
                <div>✦</div>
                <span>
                  <b>8 scenes ready</b>
                  <small>Voiceover matched</small>
                </span>
                <CheckCircle weight="fill" />
              </div>
            </div>
          </section>
          <section>
            <div className="section-title">
              <div>
                <h3>Start creating</h3>
                <p>Choose how you want to begin</p>
              </div>
              <button>
                View all tools <CaretRight />
              </button>
            </div>
            <div className="action-grid">
              {actions.map(({ t, d, i: I, c }) => (
                <button
                  className="action-card"
                  key={t}
                  onClick={() => setWizard(true)}
                >
                  <div className={"action-icon " + c}>
                    <I />
                  </div>
                  <div>
                    <strong>{t}</strong>
                    <span>{d}</span>
                  </div>
                  <CaretRight />
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="section-title">
              <div>
                <h3>Recent projects</h3>
                <p>Loaded securely from your account</p>
              </div>
              <button onClick={() => router.push("/projects")}>
                View all projects <CaretRight />
              </button>
            </div>
            {dashboardLoading ? (
              <div className="empty-projects">Loading your projects…</div>
            ) : projects.length === 0 ? (
              <div className="empty-projects">
                <Sparkle />
                <b>No videos created yet</b>
                <span>
                  Your completed videos will appear here automatically.
                </span>
                <button onClick={() => setWizard(true)}>
                  Create your first video
                </button>
              </div>
            ) : (
              <div className="project-grid">
                {projects.filter((p) => `${p.title} ${p.type} ${p.status}`.toLowerCase().includes(projectSearch.toLowerCase())).slice(0,6).map((p, i) => (
                  <article className="project" key={p.id}>
                    <div className={"thumb " + p.color}>
                      <div className="video-text">
                        {p.title.toUpperCase().slice(0, 42)}
                      </div>
                      {p.url ? (
                        <a className="play" href={p.url} target="_blank">
                          <Play weight="fill" />
                        </a>
                      ) : (
                        <button className="play">
                          <Play weight="fill" />
                        </button>
                      )}
                      <span>{p.status}</span>
                      {p.progress < 100 && (
                        <div className="rendering">
                          <Sparkle /> {p.status} {p.progress}%
                        </div>
                      )}
                    </div>
                    <div className="project-info">
                      <div>
                        <h4>{p.title}</h4>
                        <p>{p.type}</p>
                        <small>{p.date}</small>
                      </div>
                      {p.url ? (
                        <a className="project-download" href={p.url} download>
                          Download
                        </a>
                      ) : (
                        <button>
                          <DotsThree />
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      {wizard && (
        <div className="modal-back">
          <div className="wizard">
            <div className="wizard-head">
              <div>
                <div className="logo small">
                  <Play weight="fill" />
                </div>
                <b>Create a new video</b>
              </div>
              <button onClick={closeAndResetWizard}>
                <X />
              </button>
            </div>
            <div className="steps">
              {["Type", "Content", "Voice", "Style", "Preview"].map((s, i) => (
                <div
                  className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""}
                  key={s}
                >
                  <i>{step > i + 1 ? "✓" : i + 1}</i>
                  <span>{s}</span>
                </div>
              ))}
            </div>
            <div className="wizard-body">
              {step === 1 && (
                <>
                  <p className="eyebrow">STEP 1 OF 5</p>
                  <h2>Choose video format</h2>
                  <p>Select the destination format for your story.</p>
                  <div className="option-grid formats">
                    {[
                      { v: "16:9", t: "YouTube landscape", d: "1280 × 720" },
                      { v: "9:16", t: "Reels & Shorts", d: "720 × 1280" },
                      { v: "1:1", t: "Square social", d: "1080 × 1080" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        className={format === o.v ? "selected" : ""}
                        onClick={() => setFormat(o.v as typeof format)}
                      >
                        <b>{o.v}</b>
                        <strong>{o.t}</strong>
                        <small>{o.d}</small>
                        {format === o.v && <CheckCircle weight="fill" />}
                      </button>
                    ))}
                  </div>
                  <div className="background-music-control"><label className="music-enable"><input type="checkbox" checked={backgroundMusicEnabled} onChange={event=>setBackgroundMusicEnabled(event.target.checked)}/><span><b>Background music</b><small>{backgroundMusicEnabled?"Enabled for this video":"Disabled — narration only"}</small></span></label>{backgroundMusicEnabled&&<><select value={backgroundMusic?"upload":backgroundMusicPreset} onChange={e=>{const value=e.target.value;if(value!=="upload"){setBackgroundMusic(null);setBackgroundMusicPreset(value as typeof backgroundMusicPreset)}}}><option value="ambient">Default · Gentle ambient</option><option value="cinematic">Default · Cinematic pulse</option>{backgroundMusic&&<option value="upload">Uploaded · {backgroundMusic.name}</option>}</select><label><span><b>Upload your own music</b><small>{backgroundMusic?backgroundMusic.name:"MP3, WAV, M4A or OGG"}</small></span><strong>Choose file</strong><input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,.m4a" onChange={e=>uploadMusic(e.target.files?.[0])}/></label><div><button onClick={()=>{setBackgroundMusic(null);setBackgroundMusicPreset("ambient")}}>Use default</button><span>Music volume</span><input type="range" min="2" max="35" value={backgroundMusicVolume} onChange={e=>setBackgroundMusicVolume(Number(e.target.value))}/><b>{backgroundMusicVolume}%</b></div></>}</div>
                </>
              )}
              {step === 2 && (
                <>
                  <p className="eyebrow">STEP 2 OF 5</p>
                  <h2>AI-assisted title and content</h2>
                  <p>
                    Generate editable starter content locally, or paste your own
                    script.
                  </p>
                  <div className="script-generator">
                    <input
                      value={scriptTopic}
                      onChange={(e) => setScriptTopic(e.target.value)}
                      placeholder="Enter a topic, e.g. History of the Kakatiya Dynasty"
                    />
                    <select
                      value={scriptLanguage}
                      onChange={(e) =>
                        setScriptLanguage(e.target.value as "en" | "te")
                      }
                    >
                      <option value="en">English</option>
                      <option value="te">Telugu</option>
                    </select>
                    <button
                      onClick={generateScript}
                      disabled={generatingScript}
                    >
                      <Sparkle />
                      {generatingScript ? "Generating…" : "AI Generate Content"}
                    </button>
                    <button className={dictatingContent?"dictating":""} onClick={toggleContentDictation}><Microphone weight="fill"/>{dictatingContent?"Stop recording":"Record content"}</button>
                  </div>
                  <div className="admin-fields title-field">
                    <div>
                      <input
                        value={videoTitle}
                        onChange={(e) => {
                          setVideoTitle(e.target.value);
                          setAiGenerated(false);
                        }}
                        placeholder="Generated or manual video title"
                      />
                      {aiGenerated && (
                        <small>
                          <Sparkle /> AI generated
                        </small>
                      )}
                    </div>
                    <button onClick={generateTitle} disabled={generatingScript}>
                      Generate title
                    </button>
                  </div>
                  <label className="title-toggle">
                    <input
                      type="checkbox"
                      checked={showTitleScreen}
                      onChange={(e) => setShowTitleScreen(e.target.checked)}
                    />
                    <span>
                      <b>Show opening title screen</b>
                      <small>
                        Displays only the video title before the story
                      </small>
                    </span>
                  </label>
                  <div className="script-wrap">
                    {aiGenerated && (
                      <span className="ai-content-badge">
                        <Sparkle /> AI-generated draft
                      </span>
                    )}
                    <textarea
                      className="script"
                      value={script}
                      onChange={(e) => {
                        setScript(e.target.value);
                        setAiGenerated(false);
                        setRenderError("");
                      }}
                      placeholder="Write or paste your video script here..."
                    />
                  </div>
                  <div className="script-stats">
                    <span>
                      {[...script].length.toLocaleString()} characters
                    </span>
                    <span>
                      {script.split(/\n+/).filter((v) => v.trim()).length}{" "}
                      sections
                    </span>
                    <span>
                      ≈ {Math.max(1, Math.ceil([...script].length / 850))} min ·{" "}
                      {Math.max(100, Math.ceil([...script].length / 850) * 100)}{" "}
                      credits
                    </span>
                  </div>
                  <label className="title-toggle engagement-toggle">
                    <input
                      type="checkbox"
                      checked={showEngagementCta}
                      onChange={(e) => setShowEngagementCta(e.target.checked)}
                    />
                    <span>
                      <b>Add audience reminder</b>
                      <small>
                        Shows a short professional follow prompt near the end
                      </small>
                    </span>
                  </label>
                </>
              )}
              {step === 3 && (
                <>
                  <p className="eyebrow">STEP 3 OF 5</p>
                  <h2>Choose your story voice</h2>
                  <p>Choose a narration voice to read the final script from Step 2.</p>
                  <div className="option-grid voice-grid">
                    {[
                      {
                        v: "Padmavathi",
                        t: "Padmavathi",
                        d: "Telugu female · Installed",
                      },
                      {
                        v: "Venkatesh",
                        t: "Venkatesh",
                        d: "Telugu male · Installed",
                      },
                      { v: "Samantha", t: "Samantha", d: "English female" },
                      { v: "Alex", t: "Alex", d: "English neutral" },
                      { v: "Daniel", t: "Daniel", d: "English deep male" },
                      { v: "Victoria", t: "Victoria", d: "English warm female" },
                      { v: "Child Telugu", t: "Chinni", d: "Telugu child style" },
                      { v: "Child English", t: "Junior", d: "English child style" },
                    ].map((o) => (
                      <div className="voice-card-wrap" key={o.v}><button
                          className={voice === o.v ? "selected" : ""}
                          onClick={() => setVoice(o.v)}
                        ><strong>{o.t}</strong><small>{o.d}</small>{voice === o.v && <CheckCircle weight="fill" />}</button><button className="voice-preview" onClick={()=>previewVoice(o.v)}>▶ Sample</button></div>
                    ))}
                  </div>
                  <div className={voice==="Own voice"?"own-voice-panel active":"own-voice-panel"}>
                    <div><Microphone weight="fill"/><span><b>Own voice narration</b><small>Read the final script below once; this recording becomes the narration.</small></span></div>
                    <div className="own-voice-actions">
                      <button onClick={toggleNarrationRecording} className={recordingNarration?"dictating":""}>{recordingNarration?"Stop & use recording":"Record narration"}</button>
                      <label><UploadSimple/>{uploadingNarration?"Uploading…":"Upload narration"}<input type="file" accept="audio/wav,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/webm,.m4a" disabled={uploadingNarration||recordingNarration} onChange={event=>uploadNarration(event.target.files?.[0])}/></label>
                    </div>
                    {ownVoice&&<p><CheckCircle weight="fill"/> Ready: {ownVoice.name}</p>}
                    <details><summary>Show script to read</summary><div className="narration-script">{script}</div></details>
                  </div>
                  <label className="range-label">
                    <span>Speaking speed</span>
                    <b>{speed} words/min</b>
                    <input
                      type="range"
                      min="110"
                      max="200"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    />
                  </label>
                  <p className="local-note">
                    Installed voices synthesize the script automatically. Own voice uses the complete narration you record or upload here.
                  </p>
                </>
              )}
              {step === 4 && (
                <>
                  <p className="eyebrow">STEP 4 OF 5</p>
                  <h2>Choose your visual direction</h2>
                  <p>
                    Your videos are used first; remaining scenes receive
                    topic-matched images or generated backgrounds.
                  </p>
                  <details className="visual-choice-accordion"><summary><span><b>Visual choices</b><small>Tap to show or hide styles, templates and motion</small></span><CaretRight/></summary><div className="visual-choice-content"><div className="style-grid compact">
                    {[
                      { v: "heritage", t: "Indian Heritage", c: "heritage" },
                      { v: "royal", t: "Royal Violet", c: "royal" },
                      { v: "minimal", t: "Minimal Dark", c: "minimal" },
                      { v: "aurora", t: "Aurora Flow", c: "aurora" },
                      { v: "cinematic", t: "Cinematic Gold", c: "cinematic" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        className={style === o.v ? "selected" : ""}
                        onClick={() => setStyle(o.v)}
                      >
                        <i className={o.c} />
                        <strong>{o.t}</strong>
                        {style === o.v && <CheckCircle weight="fill" />}
                      </button>
                    ))}
                  </div>
                  <div className="visual-source-panel"><div className="visual-source-heading"><div><b>Visual source</b><small>Choose automatic storytelling or one of your available templates.</small></div><span>{selectedTemplate ? "Template selected" : "Recommended"}</span></div><div className="visual-template-grid"><button className={`visual-template-card automatic ${!selectedTemplate ? "selected" : ""}`} onClick={()=>{setSelectedTemplate(null);setUploadedMedia([])}}><div className="visual-auto-preview"><Sparkle weight="fill"/><span>AI</span></div><div className="visual-card-copy"><b>Smart story visuals</b><small>Mix related clips, images and generated backgrounds for every scene.</small></div><i>{!selectedTemplate ? <CheckCircle weight="fill"/> : "Select"}</i></button>{templates.map((template)=><button key={template.id} className={`visual-template-card ${selectedTemplate?.id===template.id?"selected":""}`} onClick={()=>{setSelectedTemplate(template);setStyle(template.style||"heritage");setUploadedMedia(template.videoUrl?[{url:template.videoUrl,name:template.name,type:"video/mp4"}]:[])}}><div className="visual-card-preview">{template.videoUrl?<video src={template.videoUrl} muted loop playsInline onMouseEnter={event=>event.currentTarget.play().catch(()=>{})} onMouseLeave={event=>{event.currentTarget.pause();event.currentTarget.currentTime=0}}/>:<div className={`template-swatch ${template.style}`}/>}<span>VIDEO TEMPLATE</span></div><div className="visual-card-copy"><b>{template.name}</b><small>{template.description||`${template.style} visual treatment`}</small></div><i>{selectedTemplate?.id===template.id?<CheckCircle weight="fill"/>:"Select"}</i></button>)}</div>{templates.length===0&&<button className="visual-library-link" onClick={()=>router.push('/templates')}>Create or upload a reusable template →</button>}</div>
                  <div className="image-motion-picker"><div><b>Image animation</b><small>Add movement to still-image scenes</small></div>{([{v:"none",t:"No motion",d:"Static frames"},{v:"zoom",t:"Gentle zoom",d:"Slow cinematic focus"},{v:"pan",t:"Cinematic pan",d:"Horizontal camera movement"},{v:"fade",t:"Soft fade",d:"Fade in and out"}] as const).map(option=><button key={option.v} className={imageAnimation===option.v?"selected":""} onClick={()=>setImageAnimation(option.v)}><span>{option.t}</span><small>{option.d}</small>{imageAnimation===option.v&&<CheckCircle weight="fill"/>}</button>)}</div>
                  <label className="media-upload">
                    <Images />
                    <span>
                      <b>
                        {uploadingMedia
                          ? "Uploading media…"
                          : uploadedMedia.length
                            ? `${uploadedMedia.length} related files added`
                            : "Add related images or videos"}
                      </b>
                      <small>
                        MP4, MOV, WebM, JPG, PNG or WebP · up to 12 files
                      </small>
                    </span>
                    <UploadSimple />
                    <input
                      type="file"
                      multiple
                      accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp"
                      disabled={uploadingMedia}
                      onChange={(e) => uploadMedia(e.target.files ?? undefined)}
                    />
                  </label>
                  {uploadedMedia.length > 0 && (
                    <div className="media-chips">
                      {uploadedMedia.map((m, i) => (
                        <span key={m.url}>
                          {m.type.startsWith("video") ? "▶" : "▧"} {m.name}
                          <button
                            onClick={() =>
                              setUploadedMedia((v) =>
                                v.filter((_, x) => x !== i),
                              )
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  </div></details><div className="caption-controls">
                    <label>
                      <input
                        type="checkbox"
                        checked={showCaptions}
                        onChange={(e) => setShowCaptions(e.target.checked)}
                      />
                      <span>
                        <b>Show story text</b>
                        <small>Display captions over the video</small>
                      </span>
                    </label>
                    {showCaptions && (
                      <>
                        <select
                          value={captionPosition}
                          onChange={(e) =>
                            setCaptionPosition(
                              e.target.value as typeof captionPosition,
                            )
                          }
                        >
                          <option value="bottom">Bottom</option>
                          <option value="top">Top</option>
                        </select>
                        <select
                          value={captionSize}
                          onChange={(e) =>
                            setCaptionSize(e.target.value as typeof captionSize)
                          }
                        >
                          <option value="small">Small text</option>
                          <option value="medium">Medium text</option>
                          <option value="large">Large text</option>
                        </select>
                      </>
                    )}
                  </div>
                </>
              )}
              {step === 5 && (
                <>
                  <p className="eyebrow">STEP 5 OF 5</p>
                  <h2>
                    {video
                      ? "Your video is ready!"
                      : rendering
                        ? "Creating your full video…"
                        : "Review and render"}
                  </h2>
                  <p>
                    {video
                      ? `${video.scenes} scenes · ${Math.floor(video.duration / 60)}m ${video.duration % 60}s · ${video.voice}`
                      : `${format} · ${voice} voice · ${style} style`}
                  </p>
                  {video ? (
                    <div className="result-video">
                      <video src={video.url} controls playsInline />
                      <a href={video.url} download>
                        Download MP4
                      </a>
                      <div className="publish-box">
                        <b>Publish your new video</b>
                        <span>
                          Download first, then open your preferred platform to
                          upload.
                        </span>
                        <div>
                          <a
                            href="https://studio.youtube.com"
                            target="_blank"
                            rel="noreferrer"
                          >
                            YouTube
                          </a>
                          <a
                            href="https://www.instagram.com"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Instagram
                          </a>
                          <a
                            href="https://www.facebook.com"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Facebook
                          </a>
                          <a
                            href="https://www.linkedin.com/feed/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            LinkedIn
                          </a>
                        </div>
                      </div>
                      {video.voice.includes("narration failed") && (
                        <p className="render-error">
                          {video.voice}
                        </p>
                      )}
                      {video.media && video.media.length > 0 && (
                        <details className="media-credits">
                          <summary>
                            {video.media.length} licensed story visuals used
                          </summary>
                          {video.media.map((m, i) => (
                            <a
                              href={m.source}
                              target="_blank"
                              rel="noreferrer"
                              key={i}
                            >
                              {m.title.replace("File:", "")} · {m.license}
                            </a>
                          ))}
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="preview-box">
                      <Sparkle />
                      <b>
                        {rendering
                          ? progressLabel
                          : `Full script · ${script.split(/\n+/).filter((v) => v.trim()).length} sections`}
                      </b>
                      <span>
                        {rendering
                          ? `${renderStatus} · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} elapsed`
                          : "Related licensed images and clips will be selected from Pixabay and open fallbacks."}
                      </span>
                      {rendering&&<div className="render-story-message"><Sparkle weight="fill"/><span key={Math.floor(elapsed/9)}>{renderMessages[Math.floor(elapsed/9)%renderMessages.length]}</span></div>}
                      {rendering && (
                        <div className="progress">
                          <i style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {step === 4 &&
                (user?.hasPaid || user?.role === "ADMIN" ? (
                  <label className="premium-media-option">
                    <input
                      type="checkbox"
                      checked={useRelatedVideos}
                      onChange={(e) => setUseRelatedVideos(e.target.checked)}
                    />
                    <span>
                      <b>
                        <Sparkle /> Mix related story videos
                      </b>
                      <small>
                        Premium · combines topic-matched licensed clips and images
                        based on each scene
                      </small>
                    </span>
                  </label>
                ) : (
                  <div className="premium-media-option locked">
                    <Sparkle />
                    <span>
                      <b>Related story videos</b>
                      <small>
                        Unlocks after your first payment is approved by an admin
                      </small>
                    </span>
                    <button onClick={() => router.push("/buy-credits")}>
                      Buy credits
                    </button>
                  </div>
                ))}
              {step === 1 && (
                <label className="country-option">
                  <span>
                    <b>Target country</b>
                    <small>
                      Used for organizing and filtering country-specific videos
                    </small>
                  </span>
                  <select
                    value={videoCountry}
                    onChange={(e) => setVideoCountry(e.target.value)}
                  >
                    <option value="GLOBAL">Global</option>
                    <option value="IN">India</option>
                    <option value="US">United States</option>
                    <option value="GB">United Kingdom</option>
                    <option value="AE">United Arab Emirates</option>
                    <option value="CA">Canada</option>
                    <option value="AU">Australia</option>
                    <option value="SG">Singapore</option>
                  </select>
                </label>
              )}
              {renderError && (
                <div className="credit-error">
                  <p className="render-error">{renderError}</p>
                  {renderError.toLowerCase().includes("credit") && (
                    <button onClick={() => router.push("/buy-credits")}>
                      Buy credits now
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="wizard-foot">
              <button
                disabled={rendering}
                onClick={() =>
                  step === 1 ? closeAndResetWizard() : setStep(step - 1)
                }
              >
                Back
              </button>
              <div>
                <span>
                  {video ? "Saved to local renders" : "Saved automatically"}
                </span>
                <button
                  disabled={rendering}
                  className="continue"
                  onClick={() =>
                    step < 5
                      ? setStep(step + 1)
                      : video
                        ? closeAndResetWizard()
                        : createVideo()
                  }
                >
                  {rendering
                    ? "Rendering…"
                    : video
                      ? "Done"
                      : step === 5
                        ? "Create full video"
                        : "Continue"}{" "}
                  {!rendering && <CaretRight />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
