"use strict";

/**
 * check-voice.js
 * ---------------------------------------------------------------
 * בדיקה מקדימה לפני הרינדור: איזה ספק קריינות ייבחר בפועל, ואיזה
 * קול. זה מונע את המקרה הכי מתסכל — לרנדר ארבע דקות ואז לגלות
 * שהקריינות נשמעת רובוטית כי המפתח חסר.
 *
 * לא נכשל בכוונה: גם בלי ElevenLabs אפשר לרנדר, אבל הלוג והסיכום
 * של ה־Action אומרים את זה בקול רם.
 */

const DEFAULT_ELEVENLABS_VOICE = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_GOOGLE_VOICE = "he-IL-Chirp3-HD-Aoede";

const hasEleven = Boolean(process.env.ELEVENLABS_API_KEY);
const hasGoogle = Boolean(process.env.GOOGLE_TTS_API_KEY);
const preference = String(process.env.TTS_PROVIDER || "auto").toLowerCase();

// אותו סדר בדיוק כמו ב־tts.js, כדי שהדוח ישקף את המציאות.
function providerOrder() {
  if (preference === "google") return ["google", "elevenlabs"];
  if (preference === "elevenlabs") return ["elevenlabs", "google"];
  return hasEleven ? ["elevenlabs", "google"] : ["google", "elevenlabs"];
}

const available = [];
for (const name of providerOrder()) {
  if (name === "elevenlabs" && !hasEleven) {
    available.push({name, ok: false, why: "ELEVENLABS_API_KEY is not set"});
    continue;
  }
  if (name === "google" && !hasGoogle) {
    available.push({name, ok: false, why: "GOOGLE_TTS_API_KEY is not set"});
    continue;
  }
  available.push({name, ok: true});
}

const chosen = available.find((entry) => entry.ok);
const lines = [];

if (chosen && chosen.name === "elevenlabs") {
  lines.push(
    `[voice] ElevenLabs, voice ${process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE}, ` +
      `model ${process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2"}`
  );
  lines.push(
    `[voice] stability ${process.env.ELEVENLABS_STABILITY || 0.3} · ` +
      `style ${process.env.ELEVENLABS_STYLE || 0.55} · ` +
      `similarity ${process.env.ELEVENLABS_SIMILARITY || 0.85}`
  );
} else if (chosen && chosen.name === "google") {
  lines.push(
    `[voice] Google Cloud TTS, voice ${
      process.env.GOOGLE_TTS_VOICE || DEFAULT_GOOGLE_VOICE
    }`
  );
  lines.push(
    "[voice] This is the fallback voice. It is accurate but flat — for the " +
      "human-sounding narration set ELEVENLABS_API_KEY in Settings → Secrets."
  );
} else {
  lines.push("[voice] No TTS key is set — the render will fail at narration.");
}

for (const entry of available) {
  if (!entry.ok) lines.push(`[voice] ${entry.name} unavailable: ${entry.why}`);
}

lines.forEach((line) => console.log(line));

if (chosen && chosen.name === "google") {
  console.log(
    "::warning::Narration will use the flat Google voice. Set ELEVENLABS_API_KEY (Settings → Secrets → Actions) for the natural Hebrew voice."
  );
}

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const body = [
    "### Narration",
    "",
    chosen && chosen.name === "elevenlabs"
      ? "✅ ElevenLabs (natural voice)"
      : chosen && chosen.name === "google"
      ? "⚠️ Google Cloud TTS — fallback voice, sounds robotic"
      : "❌ No TTS key set",
    "",
    ...lines.map((line) => `- ${line.replace(/^\[voice\] /, "")}`),
    "",
  ].join("\n");

  try {
    require("fs").appendFileSync(summaryFile, body);
  } catch (error) {
    console.warn(`[voice] could not write the step summary: ${error.message}`);
  }
}
