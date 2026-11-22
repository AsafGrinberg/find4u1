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
// הקול העברי הוותיק של גוגל (מדבר עברית, לא קורא אותה).
const DEFAULT_GOOGLE_VOICE = "he-IL-Wavenet-A";

const DEFAULT_GEMINI_VOICE = "Sadachbia";
const hasGemini = Boolean(process.env.GEMINI_API_KEY);
const hasEleven = Boolean(process.env.ELEVENLABS_API_KEY);
const hasGoogle = Boolean(process.env.GOOGLE_TTS_API_KEY);
const preference = String(process.env.TTS_PROVIDER || "auto").toLowerCase();

// אותו סדר בדיוק כמו ב־tts.js, כדי שהדוח ישקף את המציאות.
function providerOrder() {
  if (preference === "gemini") return ["gemini", "google", "elevenlabs"];
  if (preference === "google") return ["google", "elevenlabs", "gemini"];
  if (preference === "elevenlabs") return ["elevenlabs", "gemini", "google"];
  if (process.env.ELEVENLABS_VOICE_ID)
    return ["gemini", "elevenlabs", "google"];
  return ["gemini", "google", "elevenlabs"];
}

const available = [];
for (const name of providerOrder()) {
  if (name === "gemini" && !hasGemini) {
    available.push({name, ok: false, why: "GEMINI_API_KEY is not set"});
    continue;
  }
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

if (chosen && chosen.name === "gemini") {
  lines.push(
    `[voice] Gemini TTS, voice ${
      process.env.GEMINI_TTS_VOICE || DEFAULT_GEMINI_VOICE
    }, model ${process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts"}`
  );
  lines.push(
    `[voice] one request per video (free tier = 10/day/model) · ` +
      `pace ${process.env.GEMINI_TTS_SPEED || 1.12} · ` +
      `fallback model ${process.env.GEMINI_TTS_FALLBACK_MODEL || "gemini-3.8-flash-lite-tts"}`
  );
} else if (chosen && chosen.name === "elevenlabs") {
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
    } (native Hebrew, per-sentence pace from the script)`
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
          "::warning::No TTS provider is configured — set GEMINI_API_KEY (Gemini TTS), GOOGLE_TTS_API_KEY (Cloud TTS) or ELEVENLABS_API_KEY."
  );
}

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const body = [
    "### Narration",
    "",
    chosen && chosen.name === "gemini"
      ? "✅ Gemini TTS (natural Hebrew voice)"
      : chosen && chosen.name === "elevenlabs"
      ? "✅ ElevenLabs (natural voice)"
      : chosen && chosen.name === "google"
      ? "✅ Google Cloud TTS (native Hebrew voice)"
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
