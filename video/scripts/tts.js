"use strict";

/**
 * tts.js
 * ---------------------------------------------------------------
 * הקראה בעברית לשם הסרטון.
 *
 * הסדר (TTS_PROVIDER):
 *   auto (ברירת מחדל) — ElevenLabs קודם אם יש מפתח, ואז גוגל.
 *   google            — גוגל קודם (המכסה החינמית הגדולה), ElevenLabs כגיבוי.
 *   elevenlabs        — רק ElevenLabs קודם, גוגל כגיבוי.
 *
 * למה ElevenLabs כברירת מחדל: Chirp 3 HD של גוגל מדויק אבל שטוח,
 * ואילו ElevenLabs מדבר עם נגיעה אנושית (הדגשות, נשימות, סוף משפט
 * יורד). אם המפתח חסר או המכסה נגמרה — נופלים חזרה לגוגל אוטומטית.
 *
 * איכות: מבקשים קודם LINEAR16 (WAV, 48kHz) ולא MP3. גוגל מחזירה
 * MP3 ב־32kbps, וזה מה שנשמע דק ו"טלפוני". אם הקול לא תומך ב־WAV
 * (400) — נופלים חזרה ל־MP3 של אותו קול. ElevenLabs מוחזר ב־128kbps.
 *
 * מחזיר {buffer, source, format, rate}:
 *   format — "wav" או "mp3"
 *   rate   — קצב ניגון מומלץ ב־Remotion
 */

const GOOGLE_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

// קולות עבריים בגוגל, מהטבעי לרובוטי. Chirp 3 HD הוא הקול השיווקי
// (נוסף לעברית ב־10.11.2025); אם הוא לא זמין בפרויקט — WaveNet.
const GOOGLE_VOICES = [
  process.env.GOOGLE_TTS_VOICE,
  "he-IL-Chirp3-HD-Aoede",
  "he-IL-Chirp3-HD-Zephyr",
  "he-IL-Chirp3-HD-Charon",
  "he-IL-Wavenet-A",
  "he-IL-Standard-A",
].filter(Boolean);

// Chirp 3 HD לא תומך ב־SSML ולא בקצב/גובה קול, ולכן שולחים לו רק
// את קידוד האודיו. שליחת speakingRate אליו מחזירה שגיאה.
const isChirp = (voice) => /Chirp3?-HD/i.test(voice);

// קול ברירת מחדל של ElevenLabs: Sarah (רב־לשוני, עברית טבעית).
const ELEVENLABS_VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

function clampSpeed(value, fallback) {
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed < 0.8 || speed > 1.35) return fallback;
  return speed;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

// Chirp 3 HD מקריא עברית לאט (~9 תווים בשנייה). האצה עדינה מחזירה
// קצב דיבור אנושי; ה־<Audio> של Remotion שומר על הגובה.
const GOOGLE_SPEED = clampSpeed(process.env.TTS_SPEED, 1.08);
// ElevenLabs כבר מדבר בקצב אנושי; מהירות נפרדת כדי ש־TTS_SPEED של
// גוגל לא יאיץ גם אותו.
const ELEVENLABS_SPEED = clampSpeed(process.env.ELEVENLABS_SPEED, 1);

// קידודים לפי סדר עדיפות: איכות מלאה, ואז תאימות.
function audioConfigs(voice) {
  const base = isChirp(voice) ? {} : {speakingRate: 1.0, pitch: 0};
  return [
    {audioEncoding: "LINEAR16", sampleRateHertz: 48000, ...base},
    {audioEncoding: "MP3", ...base},
  ];
}

async function googleRequest(text, voice, audioConfig) {
  return fetch(
    `${GOOGLE_ENDPOINT}?key=${encodeURIComponent(process.env.GOOGLE_TTS_API_KEY)}`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        input: {text},
        voice: {languageCode: "he-IL", name: voice},
        audioConfig,
      }),
    }
  );
}

async function googleTts(text, voice) {
  let lastError = null;

  for (const audioConfig of audioConfigs(voice)) {
    const response = await googleRequest(text, voice, audioConfig);

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const error = new Error(
        `Google TTS ${response.status}: ${details.slice(0, 300)}`
      );
      error.status = response.status;
      error.details = details;
      lastError = error;
      // 400 יכול להיות "הקידוד הזה לא נתמך בקול הזה" — מנסים MP3.
      if (response.status === 400) continue;
      throw error;
    }

    const json = await response.json();
    if (!json.audioContent) {
      lastError = new Error("Google TTS returned no audioContent");
      continue;
    }

    return {
      buffer: Buffer.from(json.audioContent, "base64"),
      format: audioConfig.audioEncoding === "LINEAR16" ? "wav" : "mp3",
      rate: GOOGLE_SPEED,
    };
  }

  throw lastError || new Error("Google TTS failed");
}

/**
 * ElevenLabs. stability נמוך + style גבוה = דיבור חי והבעתי.
 * אפשר לכוונן דרך ELEVENLABS_STABILITY / ELEVENLABS_STYLE.
 */
async function elevenLabsTts(text) {
  if (!process.env.ELEVENLABS_API_KEY) return null;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      ELEVENLABS_VOICE
    )}?output_format=${encodeURIComponent(
      process.env.ELEVENLABS_FORMAT || "mp3_44100_128"
    )}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
        // "סטייל" גבוה נותן אינטונציה של פרסומת, לא של קריין חדשות.
        voice_settings: {
          stability: envNumber("ELEVENLABS_STABILITY", 0.3),
          similarity_boost: envNumber("ELEVENLABS_SIMILARITY", 0.85),
          style: envNumber("ELEVENLABS_STYLE", 0.55),
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`ElevenLabs ${response.status}: ${details.slice(0, 300)}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    format: "mp3",
    rate: ELEVENLABS_SPEED,
  };
}

async function tryGoogle(text, failures) {
  if (!process.env.GOOGLE_TTS_API_KEY) {
    failures.push("GOOGLE_TTS_API_KEY is missing");
    return null;
  }

  for (const voice of [...new Set(GOOGLE_VOICES)]) {
    try {
      const result = await googleTts(text, voice);
      console.log(
        `[tts] Google Cloud TTS (${voice}, ${result.format}, ${result.rate}x) — ${result.buffer.length} bytes`
      );
      return {...result, source: `google:${voice}`};
    } catch (error) {
      failures.push(error.message);
      console.warn(`[tts] Google voice ${voice} failed: ${error.message}`);
      // 401/403 = מפתח לא תקין או API לא מופעל, אין טעם לנסות קול אחר.
      if (error.status === 401 || error.status === 403) break;
    }
  }

  return null;
}

async function tryElevenLabs(text, failures) {
  try {
    const result = await elevenLabsTts(text);
    if (result) {
      console.log(
        `[tts] ElevenLabs (${result.format}, ${result.rate}x) — ${result.buffer.length} bytes`
      );
      return {...result, source: "elevenlabs"};
    }
    failures.push("ELEVENLABS_API_KEY is missing");
  } catch (error) {
    failures.push(error.message);
    console.warn(`[tts] ElevenLabs failed: ${error.message}`);
  }
  return null;
}

function providerOrder() {
  const preference = String(process.env.TTS_PROVIDER || "auto").toLowerCase();

  if (preference === "google") return [tryGoogle, tryElevenLabs];
  if (preference === "elevenlabs") return [tryElevenLabs, tryGoogle];

  // auto: קול אנושי קודם, ואם אין מפתח / נגמרה המכסה — גוגל.
  return process.env.ELEVENLABS_API_KEY
    ? [tryElevenLabs, tryGoogle]
    : [tryGoogle, tryElevenLabs];
}

async function synthesizeHebrew(text) {
  const failures = [];

  for (const provider of providerOrder()) {
    const result = await provider(text, failures);
    if (result) {
      // אזהרה גלויה בלוג של GitHub Actions: זה מה שמסביר קריינות רובוטית.
      if (
        result.source.startsWith("google") &&
        !process.env.ELEVENLABS_API_KEY
      ) {
        console.log(
          "::warning::Narration used Google TTS because ELEVENLABS_API_KEY is not set. Add it in Settings → Secrets for the natural Hebrew voice."
        );
      }
      return result;
    }
  }

  throw new Error(
    "No TTS provider worked. Set ELEVENLABS_API_KEY (natural) or " +
      "GOOGLE_TTS_API_KEY (free tier).\n" +
      failures.map((line) => ` - ${line}`).join("\n")
  );
}

module.exports = {synthesizeHebrew};
