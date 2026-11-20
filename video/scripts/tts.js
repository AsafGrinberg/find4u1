"use strict";

/**
 * tts.js
 * ---------------------------------------------------------------
 * הקראה בעברית — משפט אחד בכל בקשה.
 *
 * למה משפט־משפט ולא אודיו אחד ארוך: ככה לכל משפט יש משך אמיתי,
 * וממנו נגזרים הכתוביות, החלפות הקליפים ואורך הסרטון (timeline.js).
 * זה גם מאפשר קצב דיבור שונה לכל משפט ("pace control").
 *
 * מה שמתועד ונתמך (ובדקו מול התיעוד, לא נוחש):
 *   • Google Cloud TTS v1 text:synthesize
 *     voice     — he-IL-Chirp3-HD-<שם>, לדוגמה he-IL-Chirp3-HD-Achernar
 *     audioConfig — LINEAR16 48kHz, ו-speakingRate (pace) שמתועד
 *                   לדף Chirp 3: HD לטווח 0.25–2.0 בכל השפות.
 *   • דף "Supported voices" של Cloud TTS עדיין מציין ש-Chirp 3: HD
 *     "doesn't support ... speaking rate". שני הדפים הרשמיים סותרים,
 *     ולכן הקוד לא מסתמך על זה: שולחים speakingRate, ואם ה-API מחזיר
 *     400 — מבקשים שוב בלי קצב ומאיצים את הפריים ב-Remotion. ככה
 *     הריל לא נשבר באף אחד מהמקרים, והאודיו לא מואץ פעמיים.
 *   • SSML לא בשימוש: גם כאן יש סתירה בין הדפים (הדף של Chirp 3: HD
 *     מפרט תגים נתמכים, דף הקולות אומר שאין SSML). הפסקות בין משפטים
 *     נעשות בציר הזמן, לא בתג SSML.
 *
 * מחזיר [{index, buffer, format, playbackRate, seconds, source}]
 * seconds הוא המשך האפקטיבי (אחרי playbackRate והורדת שקט).
 */

const {trimWavSilence} = require("./wav-trim");
const {mp3DurationSeconds} = require("./mp3-duration");

const GOOGLE_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

/**
 * קולות Chirp 3 HD בעברית (he-IL), עם הסגנון שמופיע בטבלת הקולות
 * הרשמית של גוגל. Achernar = Soft, ולכן נשמע רגוע; לריל מכירה prefer
 * קול "חם"/"עליז".
 */
const HE_VOICES = [
  {name: "he-IL-Chirp3-HD-Sulafat", style: "Warm"},
  {name: "he-IL-Chirp3-HD-Achernar", style: "Soft"},
  {name: "he-IL-Chirp3-HD-Aoede", style: "Breezy"},
  {name: "he-IL-Chirp3-HD-Zephyr", style: "Bright"},
  {name: "he-IL-Chirp3-HD-Wavenet-A", style: "Premium"},
  {name: "he-IL-Standard-A", style: "Standard"},
];

const GOOGLE_VOICES = [
  ...(process.env.GOOGLE_TTS_VOICE ? [process.env.GOOGLE_TTS_VOICE] : []),
  ...HE_VOICES.map((voice) => voice.name),
];

const isChirp = (voice) => /Chirp3?-HD/i.test(voice);

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

// מכפיל קצב גלובלי (TTS_SPEED) מעל הקצב שנקבע לכל משפט בתסריט.
const SPEED_MULTIPLIER = clampSpeed(process.env.TTS_SPEED, 1);
const ELEVENLABS_SPEED = clampSpeed(process.env.ELEVENLABS_SPEED, 1);

const paceFor = (sentence) =>
  clampSpeed((Number(sentence.rate) || 1) * SPEED_MULTIPLIER, 1);

// ---- Google ------------------------------------------------------------
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

async function googleSentence(text, pace, voice) {
  // ניסיון 1: WAV עם קצב דיבור (מתועד, נתמך ב-Chirp 3 HD).
  // ניסיון 2: WAV בלי קצב — אם ה-API דוחה speakingRate, מאיצים ב-Remotion.
  // ניסיון 3: MP3, אם הקול לא תומך ב-LINEAR16.
  const attempts = [
    {
      audioConfig: {
        audioEncoding: "LINEAR16",
        sampleRateHertz: 48000,
        speakingRate: pace,
      },
      playbackRate: 1,
    },
    {
      audioConfig: {audioEncoding: "LINEAR16", sampleRateHertz: 48000},
      playbackRate: pace,
    },
    {
      audioConfig: {audioEncoding: "MP3"},
      playbackRate: pace,
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const response = await googleRequest(text, voice, attempt.audioConfig);

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const error = new Error(
        `Google TTS ${response.status}: ${details.slice(0, 300)}`
      );
      error.status = response.status;
      lastError = error;
      if (response.status === 400) continue;
      throw error;
    }

    const json = await response.json();
    if (!json.audioContent) {
      lastError = new Error("Google TTS returned no audioContent");
      continue;
    }

    const buffer = Buffer.from(json.audioContent, "base64");
    if (attempt.audioConfig.audioEncoding === "LINEAR16") {
      const trimmed = trimWavSilence(buffer);
      return {
        buffer: trimmed.buffer,
        format: "wav",
        playbackRate: attempt.playbackRate,
        seconds: trimmed.seconds / attempt.playbackRate,
      };
    }

    return {
      buffer,
      format: "mp3",
      playbackRate: attempt.playbackRate,
      seconds:
        mp3DurationSeconds(buffer) / attempt.playbackRate,
    };
  }

  throw lastError || new Error("Google TTS failed");
}

async function runGoogle(sentences, failures) {
  if (!process.env.GOOGLE_TTS_API_KEY) {
    failures.push("GOOGLE_TTS_API_KEY is missing");
    return null;
  }

  for (const voice of [...new Set(GOOGLE_VOICES)]) {
    try {
      const results = [];
      for (const sentence of sentences) {
        const pace = paceFor(sentence);
        const result = await googleSentence(sentence.speech, pace, voice);
        results.push({
          ...result,
          index: sentence.id - 1,
          source: `google:${voice}`,
          pace,
        });
      }
      return {voice, results};
    } catch (error) {
      failures.push(`${voice}: ${error.message}`);
      console.warn(`[tts] Google voice ${voice} failed: ${error.message}`);
      // 401/403 = מפתח לא תקין או API לא מופעל — אין טעם בקול הבא.
      if (error.status === 401 || error.status === 403) return null;
    }
  }

  return null;
}

// ---- ElevenLabs --------------------------------------------------------
async function elevenLabsSentence(text, pace) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      ELEVENLABS_VOICE
    )}?output_format=${encodeURIComponent(
      process.env.ELEVENLABS_FORMAT || "mp3_44100_128"
    )}`,
    {
      method: "POST",
      headers: {
        "x-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
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

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    format: "mp3",
    playbackRate: pace,
    seconds: mp3DurationSeconds(buffer) / pace,
  };
}

async function runElevenLabs(sentences, failures) {
  if (!process.env.ELEVENLABS_API_KEY) {
    failures.push("ELEVENLABS_API_KEY is missing");
    return null;
  }

  try {
    const results = [];
    for (const sentence of sentences) {
      const pace = ELEVENLABS_SPEED;
      const result = await elevenLabsSentence(sentence.speech, pace);
      results.push({
        ...result,
        index: sentence.id - 1,
        source: "elevenlabs",
        pace,
      });
    }
    return {voice: ELEVENLABS_VOICE, results};
  } catch (error) {
    failures.push(`elevenlabs: ${error.message}`);
    console.warn(`[tts] ElevenLabs failed: ${error.message}`);
    console.log(
      `::warning::ElevenLabs failed (${error.message.slice(
        0,
        140
      )}) — narration fell back to Google Chirp 3 HD.`
    );
    return null;
  }
}

function providerOrder() {
  const preference = String(process.env.TTS_PROVIDER || "auto").toLowerCase();
  if (preference === "google") return [runGoogle, runElevenLabs];
  if (preference === "elevenlabs") return [runElevenLabs, runGoogle];
  // auto: Chirp 3 HD העברי קודם, אלא אם נבחר קול ElevenLabs מפורש.
  if (process.env.ELEVENLABS_VOICE_ID) return [runElevenLabs, runGoogle];
  return [runGoogle, runElevenLabs];
}

/**
 * מקריא את כל המשפטים אצל ספק אחד (לא מערבבים קולות בין משפטים).
 * @returns {{provider: string, voice: string, segments: Array}}
 */
async function synthesizeSentences(sentences) {
  const failures = [];

  for (const provider of providerOrder()) {
    const result = await provider(sentences, failures);
    if (result) {
      const total = result.results.reduce((sum, item) => sum + item.seconds, 0);
      console.log(
        `[tts] ${result.results[0].source} — ${result.results.length} sentences, ${total.toFixed(
          2
        )}s total`
      );
      return {
        provider: result.results[0].source,
        voice: result.voice,
        segments: result.results,
      };
    }
  }

  throw new Error(
    "No TTS provider worked. Set GOOGLE_TTS_API_KEY (free tier) or " +
      "ELEVENLABS_API_KEY.\n" +
      failures.map((line) => ` - ${line}`).join("\n")
  );
}

module.exports = {
  synthesizeSentences,
  HE_VOICES,
  GOOGLE_VOICES,
  isChirp,
  clampSpeed,
};
