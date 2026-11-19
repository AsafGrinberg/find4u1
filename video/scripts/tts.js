"use strict";

/**
 * tts.js
 * ---------------------------------------------------------------
 * הקראה בעברית לשם הסרטון.
 *
 * 1. Google Cloud Text-to-Speech — קודם קולות Chirp 3 HD, שהם
 *    הקולות הטבעיים (כמו בן אדם), ואחריהם WaveNet/Standard כגיבוי.
 *    GOOGLE_TTS_API_KEY.
 * 2. אם גוגל נגמרה המכסה שלה, החזירה 403/429 או שגיאה אחרת —
 *    עוברים ל־ElevenLabs (ELEVENLABS_API_KEY).
 *
 * איכות: מבקשים קודם LINEAR16 (WAV, 48kHz) ולא MP3. גוגל מחזירה
 * MP3 ב־32kbps, וזה מה שנשמע דק ו"טלפוני". אם הקול לא תומך ב־WAV
 * (400) — נופלים חזרה ל־MP3 של אותו קול.
 *
 * מחזיר {buffer, source, format, rate}:
 *   format — "wav" או "mp3"
 *   rate   — קצב ניגון מומלץ ב־Remotion (Chirp מקריא לאט מהטבעי)
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

const ELEVENLABS_VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

function clampSpeed(value, fallback) {
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed < 0.8 || speed > 1.35) return fallback;
  return speed;
}

// Chirp 3 HD מקריא עברית לאט (~9 תווים בשנייה). האצה עדינה של 12%
// מחזירה קצב דיבור אנושי; ה־<Audio> של Remotion שומר על הגובה.
const GOOGLE_SPEED = clampSpeed(process.env.TTS_SPEED, 1.12);
const ELEVENLABS_SPEED = 1;

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

async function elevenLabsTts(text) {
  if (!process.env.ELEVENLABS_API_KEY) return null;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      ELEVENLABS_VOICE
    )}?output_format=mp3_44100_128`,
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
        voice_settings: {stability: 0.45, similarity_boost: 0.75},
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
        `[tts] ElevenLabs (${result.format}) — ${result.buffer.length} bytes`
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

async function synthesizeHebrew(text) {
  const failures = [];
  // הסדר הקבוע: גוגל קודם (המכסה החינמית הגדולה), ו־ElevenLabs כשהיא נגמרת.
  // TTS_PROVIDER=elevenlabs הופך את הסדר למי שאין חשבון גוגל.
  const preferEleven =
    String(process.env.TTS_PROVIDER || "").toLowerCase() === "elevenlabs";

  const providers = preferEleven
    ? [tryElevenLabs, tryGoogle]
    : [tryGoogle, tryElevenLabs];

  for (const provider of providers) {
    const result = await provider(text, failures);
    if (result) return result;
  }

  throw new Error(
    "No TTS provider worked. Set GOOGLE_TTS_API_KEY (free tier) and/or " +
      "ELEVENLABS_API_KEY.\n" +
      failures.map((line) => ` - ${line}`).join("\n")
  );
}

module.exports = {synthesizeHebrew};
