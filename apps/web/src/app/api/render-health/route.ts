import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function GET() {
  const root = join(process.cwd(), "../..");
  const piper = join(root, ".venv", "bin", "piper");
  const padmavathi = join(root, "models", "piper", "te_IN-padmavathi-medium.onnx");
  const venkatesh = join(root, "models", "piper", "te_IN-venkatesh-medium.onnx");

  return NextResponse.json({
    ok: true,
    cwd: process.cwd(),
    root,
    platform: process.platform,
    isVercel: Boolean(process.env.VERCEL),
    voiceProvider: process.env.VOICE_PROVIDER || "piper",
    hasHfApiKey: Boolean(process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY),
    kokoroModel: process.env.KOKORO_TTS_MODEL || "hexgrad/Kokoro-82M",
    piper: {
      path: piper,
      exists: existsSync(piper),
    },
    teluguModels: {
      padmavathi: existsSync(padmavathi),
      venkatesh: existsSync(venkatesh),
    },
    readyForLocalTeluguPiper:
      existsSync(piper) && existsSync(padmavathi) && existsSync(venkatesh),
  });
}
