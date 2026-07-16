import { NextRequest, NextResponse } from "next/server";

type WikiResult = {
  title: string;
  extract: string;
  description?: string;
  content_urls?: { desktop?: { page?: string } };
};
const sentenceSplit = (text: string) =>
  text
    .match(/[^.!?।]+[.!?।]+|[^.!?।]+$/gu)
    ?.map((v) => v.trim())
    .filter(Boolean) ?? [];
function sections(extract: string) {
  const sentences = sentenceSplit(extract),
    chunks: string[] = [];
  let words=0,current:string[]=[];
  for(const sentence of sentences){const count=sentence.split(/\s+/u).filter(Boolean).length;if(words&&words+count>180)break;current.push(sentence);words+=count}
  const selected=current.length?current:sentences.slice(0,4);
  for (let i = 0; i < selected.length; i += 3)
    chunks.push(selected.slice(i, i + 3).join(" "));
  return chunks.slice(0, 6);
}
async function wiki(
  topic: string,
  language: string,
): Promise<WikiResult | null> {
  const host = language === "te" ? "te.wikipedia.org" : "en.wikipedia.org",
    headers = {
      "user-agent": "DrishyanaAI/0.2 (key-free educational story generator)",
    };
  try {
    let title = topic;
    const search = await fetch(
      `https://${host}/w/api.php?action=query&format=json&list=search&srlimit=1&srsearch=${encodeURIComponent(topic)}&origin=*`,
      { headers, signal: AbortSignal.timeout(10000), cache: "no-store" },
    );
    if (search.ok) {
      const data = await search.json();
      title = data?.query?.search?.[0]?.title ?? topic;
    }
    const summary = await fetch(
      `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      { headers, signal: AbortSignal.timeout(10000), cache: "no-store" },
    );
    if (!summary.ok) return null;
    const data = await summary.json();
    return data.extract ? data : null;
  } catch {
    return null;
  }
}
function fallback(topic: string, language: string) {
  if (language === "te")
    return {
      title: `${topic} — తెలుగు కథ`,
      script: `పరిచయం\n${topic} గురించి ఈ కథ వివరిస్తుంది.\n\n1. నేపథ్యం\n${topic}కు సంబంధించిన చరిత్ర, వ్యక్తులు మరియు ముఖ్యమైన సంఘటనలను తెలుసుకుందాం.\n\n2. ప్రధాన విశేషాలు\nఈ అంశంలో ఉన్న ముఖ్యమైన మార్పులు, సవాళ్లు మరియు విజయాలు మనకు విలువైన విషయాలను తెలియజేస్తాయి.\n\nముగింపు\n${topic} నుంచి జ్ఞానం, ధైర్యం మరియు మంచి నిర్ణయాల ప్రాముఖ్యతను నేర్చుకోవచ్చు.`,
    };
  return {
    title: `${topic}: Story and Significance`,
    script: `Introduction\nThis video explores ${topic} and why it matters.\n\n1. Background\nWe begin with the people, place, and events that shaped ${topic}.\n\n2. Key developments\nThe important challenges, changes, and achievements reveal how the subject developed over time.\n\nConclusion\nThe story of ${topic} offers useful lessons about knowledge, courage, and responsible choices.`,
  };
}

export async function POST(request: NextRequest) {
  const {
    topic,
    content,
    language = "en",
    action = "content",
  } = await request.json();
  const source = String(topic || content || "").trim();
  if (!source)
    return NextResponse.json(
      {
        error:
          action === "title"
            ? "Add a title or script first."
            : "Enter a title or topic first.",
      },
      { status: 400 },
    );
  const clean = source.replace(/\s+/g, " "),
    subject = String(topic || clean.split(/[.!?।\n]/)[0]).slice(0, 120),
    article = await wiki(subject, language);
  if (action === "title") {
    const title = article?.title
      ? language === "te"
        ? `${article.title} — కథ మరియు విశేషాలు`
        : `${article.title}: The Complete Story`
      : fallback(subject, language).title;
    return NextResponse.json({
      title,
      generated: true,
      source: article?.content_urls?.desktop?.page ?? null,
    });
  }
  if (!article) {
    const local = fallback(subject, language);
    return NextResponse.json({
      ...local,
      generated: true,
      language,
      source: "local-fallback",
    });
  }
  const chunks = sections(article.extract);
  const labels =
    language === "te"
      ? [
          "పరిచయం",
          "నేపథ్యం",
          "ముఖ్య విశేషాలు",
          "ప్రధాన సంఘటనలు",
          "ప్రభావం",
          "ముగింపు",
        ]
      : [
          "Introduction",
          "Background",
          "Key facts",
          "Important developments",
          "Impact",
          "Conclusion",
        ];
  const script = chunks
    .map(
      (chunk, index) =>
        `${index ? `${index}. ` : ""}${labels[Math.min(index, labels.length - 1)]}\n${chunk}`,
    )
    .join("\n\n");
  return NextResponse.json({
    title:
      language === "te"
        ? `${article.title} — కథ మరియు విశేషాలు`
        : `${article.title}: Story and Significance`,
    script,
    generated: true,
    language,
    source:
      article.content_urls?.desktop?.page ??
      `https://${language === "te" ? "te" : "en"}.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
  });
}
