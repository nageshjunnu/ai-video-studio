import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const venv = join(root, ".venv");
const piper = join(venv, "bin", "piper");
const modelDir = join(root, "models", "piper");
const base = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const voices = [
  "te/te_IN/padmavathi/medium/te_IN-padmavathi-medium.onnx",
  "te/te_IN/padmavathi/medium/te_IN-padmavathi-medium.onnx.json",
  "te/te_IN/venkatesh/medium/te_IN-venkatesh-medium.onnx",
  "te/te_IN/venkatesh/medium/te_IN-venkatesh-medium.onnx.json",
];
const optionalVoices = [
  "te/te_IN/maya/medium/te_IN-maya-medium.onnx",
  "te/te_IN/maya/medium/te_IN-maya-medium.onnx.json",
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

async function download(url, output) {
  if (existsSync(output)) {
    console.log(`✓ ${output.replace(root + "/", "")}`);
    return;
  }
  console.log(`↓ ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
  console.log(`✓ ${output.replace(root + "/", "")}`);
}

if (!existsSync(piper)) {
  if (!existsSync(join(venv, "bin", "python"))) {
    run("python3", ["-m", "venv", ".venv"]);
  }
  run(join(venv, "bin", "python"), ["-m", "pip", "install", "--upgrade", "pip"]);
  run(join(venv, "bin", "pip"), ["install", "piper-tts"]);
} else {
  console.log("✓ .venv/bin/piper");
}

await mkdir(modelDir, { recursive: true });
for (const path of voices) {
  await download(`${base}/${path}`, join(modelDir, path.split("/").pop()));
}
for (const path of optionalVoices) {
  try {
    await download(`${base}/${path}`, join(modelDir, path.split("/").pop()));
  } catch (error) {
    console.warn(`Optional voice skipped: ${path}`);
    console.warn(error instanceof Error ? error.message : error);
  }
}

console.log("\nTelugu TTS ready.");
console.log("Use VOICE_PROVIDER=piper and restart your dev/server process.");
