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
const DEFAULT_GOOGLE_VOICE = "he-IL-Chirp3-HD-Achernar";

const hasEleven = Boolean(process.env.ELEVENLABS_API_KEY);
const hasGoogle = Boolean(process.env.GOOGLE_TTS_API_KEY);
const preference = String(process.env.TTS_PROVIDER || "auto").toLowerCase();

// אותו סדר בדיוק כמו ב־tts.js, כדי שהדוח ישקף את המציאות.
function providerOrder() {
  if (preference === "google") return ["google", "elevenlabs"];
  if (preference === "elevenlabs") return ["elevenlabs", "google"];
  // auto: Chirp 3 HD העברי קודם, אלא אם נבחר קול ElevenLabs מפורש.
  if (process.env.ELEVENLABS_VOICE_ID) return ["elevenlabs", "google"];
  return ["google", "elevenlabs"];
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
    } (Chirp 3 HD, native Hebrew, pace ${process.env.TTS_SPEED || 1.08}x)`
  );
  if (!process.env.ELEVENLABS_VOICE_ID) {
    lines.push(
      "[voice] ElevenLabs is only used when ELEVENLABS_VOICE_ID points to a " +
        "Hebrew voice; the default (Sarah) is an English voice reading Hebrew."
    );
  }
} else {
  lines.push("[voice] No TTS key is set — the render will fail at narration.");
}

for (const entry of available) {
  if (!entry.ok) lines.push(`[voice] ${entry.name} unavailable: ${entry.why}`);
}

lines.forEach((line) => console.log(line));

if (!chosen) {
  console.log(
    "::warning::No TTS provider is configured — set GOOGLE_TTS_API_KEY (free tier) or ELEVENLABS_API_KEY."
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
      ? "✅ Google Chirp 3 HD (native Hebrew voice)"
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
