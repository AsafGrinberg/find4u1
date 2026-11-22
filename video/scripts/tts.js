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
 *     voice     — he-IL-Wavenet-A (ברירת מחדל) / he-IL-Wavenet-B/C/D
 *     audioConfig — LINEAR16 48kHz, ו-speakingRate שמתועד ל-WaveNet
 *                   בטווח 0.25–4.0.
 *   • אם ה-API מחזיר 400 על speakingRate — מבקשים שוב בלי קצב ומאיצים
 *     את הפריים ב-Remotion. ככה הריל לא נשבר, והאודיו לא מואץ פעמיים.
 *   • SSML לא בשימוש: גם כאן יש סתירה בין הדפים (הדף של Chirp 3: HD
 *     מפרט תגים נתמכים, דף הקולות אומר שאין SSML). הפסקות בין משפטים
 *     נעשות בציר הזמן, לא בתג SSML.
 *
 * מחזיר [{index, buffer, format, playbackRate, seconds, source}]
 * seconds הוא המשך האפקטיבי (אחרי playbackRate והורדת שקט).
 *
 * Gemini TTS (Gemini API, לא Cloud TTS) — המנוע הראשון בשרשרת:
 *   POST generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
 *   generationConfig.responseModalities = ["AUDIO"]
 *   generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName
 * התגובה: WAV מוכן (24kHz, מונו, 16bit) ב-candidates[0].content.parts[].inlineData.
 * מפתח: GEMINI_API_KEY (נפרד מ-GOOGLE_TTS_API_KEY).
 * מה שאין בו: speakingRate ו-systemInstruction (המפתח מחזיר
 * "Developer instruction is not enabled"), וגם לא prompt סגנון — Gemini TTS
 * דרך generateContent קורא כל טקסט כטקסט לתמלול, ולכן הוראת סגנון בטקסט
 * נקראת בקול. האנרגיה מגיעה מקול שמראש הוא אנרגטי (prebuilt) ומהקצב ב-Remotion.
 * 429 (מכסת דקה) מנוסה שוב עם השהיה; 401/403 עוצר ומדרדר ל-WaveNet.
 */

const {trimWavSilence} = require("./wav-trim");
const {mp3DurationSeconds} = require("./mp3-duration");
const {splitWavBySentences} = require("./audio-split");

const GOOGLE_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

/**
 * קולות עבריים של Google Cloud TTS.
 *
 * he-IL-Wavenet-A/B/C/D הם הקולות העבריים שנוצרו לדיבור עברי (A ו-C
 * נשיים, B ו-D גבריים). הם הוגים כל מילה בשלמותה, עם הדגש במקום הנכון,
 * ומסיימים משפט רגיל בירידה — לא במנגינה של שאלה.
 *
 * קולות he-IL-Chirp3-HD הם קולות של מודל רב-לשוני אחד לכל השפות. בעברית
 * בלי ניקוד התוצאה נשמעת כמו מי שקורא מהכתב: מילים נבלעות, שני רעיונות
 * מתחברים למילה אחת ("שעות" + "ולא" → "שעותולם"), ומילים דו-משמעיות
 * נקראות אחרת ("שכמה" → "שקמה", "אתרי" → "אטארי"). לכן Chirp3-HD
 * כבר לא בשרשרת ברירת המחדל — אפשר לכפות אותו במפורש ב-GOOGLE_TTS_VOICE.
 */
const HE_VOICES = [
  {name: "he-IL-Wavenet-A", style: "Premium"},
  {name: "he-IL-Wavenet-B", style: "Premium"},
  {name: "he-IL-Wavenet-C", style: "Premium"},
  {name: "he-IL-Wavenet-D", style: "Premium"},
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

// ---- Gemini TTS --------------------------------------------------------
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// מכסת Free Tier: 10 בקשות ביום *לכל מודל*. לכן כל התסריט נשלח בבקשה
// אחת, ומודל שני משמש כמכסה נוספת אם הראשונה נגמרה.
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
const GEMINI_MODELS = [
  ...new Set(
    [GEMINI_MODEL, process.env.GEMINI_TTS_FALLBACK_MODEL ?? "gemini-3.8-flash-lite-tts"].filter(
      Boolean
    )
  ),
];

// קולות prebuilt שהוגדרו אנרגטיים: Sadachbia (Lively), Zephyr (Bright),
// Fenrir (Excitable), Puck (Upbeat), Aoede (Breezy), Laomedeia (Upbeat).
const GEMINI_VOICE = process.env.GEMINI_TTS_VOICE || "Sadachbia";

// אין speakingRate ב-Gemini. קצב מקבלים ב-playbackRate של Remotion,
// ששומר על גובה הקול (preservePitch) ולא הופך אותו לצ'יפמאנק.
const GEMINI_SPEED = clampSpeed(process.env.GEMINI_TTS_SPEED, 1.12);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(error, attempt) {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(
    error.message || ""
  );
  if (match) return Math.ceil(Number(match[1]) * 1000) + 250;
  return 4000 * (attempt + 1);
}

async function geminiSpeech(text, voice, model = GEMINI_MODELS[0], attempt = 0) {
  const response = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(
      process.env.GEMINI_API_KEY
    )}`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        contents: [{parts: [{text}]}],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: voice}},
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    const error = new Error(
      `Gemini TTS ${response.status}: ${details.slice(0, 300)}`
    );
    error.status = response.status;
    error.model = model;

    // 429 יכול להיות מכסת דקה (כדאי לנסות שוב) או מכסת יום שלמה
    // (אין טעם לחכות — עוברים למודל הבא).
    const daily =
      response.status === 429 &&
      (/per day/i.test(details) ||
        /retryDelay"\s*:\s*"(\d+)(?:\.\d+)?s/.test(details) &&
          Number(/retryDelay"\s*:\s*"(\d+)/.exec(details)[1]) > 90);
    error.daily = Boolean(daily);

    if (response.status === 429 && !daily && attempt < 4) {
      const wait = retryDelayMs(error, attempt);
      console.warn(`[tts] Gemini rate limited — retrying in ${wait}ms`);
      await sleep(wait);
      return geminiSpeech(text, voice, model, attempt + 1);
    }
    throw error;
  }

  const json = await response.json();
  const part = (json.candidates?.[0]?.content?.parts || []).find(
    (item) => item.inlineData
  );
  if (!part) throw new Error("Gemini TTS returned no audio");

  const buffer = Buffer.from(part.inlineData.data, "base64");
  return {
    buffer,
    format: /mp3/i.test(part.inlineData.mimeType || "") ? "mp3" : "wav",
  };
}

function geminiPart(text, weights) {
  const segments = splitWavBySentences(text, weights);
  if (!segments || segments.length !== weights.length) return null;
  return segments.map((segment, index) => {
    // כל מקטע נושא חצי מהפסקה שמסביב לגבול; מסירים אותו כדי שההפסקה
    // שבציר הזמן היא היחידה שקובעת את הקצב.
    const trimmed = trimWavSilence(segment.buffer);
    return {
      buffer: trimmed.buffer,
      format: "wav",
      playbackRate: GEMINI_SPEED,
      seconds: trimmed.seconds / GEMINI_SPEED,
      index,
      source: `gemini:${GEMINI_VOICE}`,
      pace: GEMINI_SPEED,
      boundary: segment.boundary,
    };
  });
}

async function runGemini(sentences, failures) {
  if (!process.env.GEMINI_API_KEY) {
    failures.push("GEMINI_API_KEY is missing");
    return null;
  }

  // ברירת מחדל: בקשה אחת לכל הסרטון (מכסת Gemini החינמית קטנה מאוד).
  // GEMINI_TTS_PER_SENTENCE=1 מבקש משפט-משפט — מדויק יותר, אבל 10 בקשות
  // לסרטון, ולכן מתאים רק לחשבון בתשלום.
  const perSentence = process.env.GEMINI_TTS_PER_SENTENCE === "1";

  for (const model of GEMINI_MODELS) {
    try {
      if (perSentence) {
        const results = [];
        for (const sentence of sentences) {
          const result = await geminiSpeech(sentence.speech, GEMINI_VOICE, model);
          if (result.format !== "wav") {
            throw new Error(`Gemini returned ${result.format}, expected WAV`);
          }
          const trimmed = trimWavSilence(result.buffer);
          results.push({
            buffer: trimmed.buffer,
            format: "wav",
            playbackRate: GEMINI_SPEED,
            seconds: trimmed.seconds / GEMINI_SPEED,
            index: sentence.id - 1,
            source: `gemini:${GEMINI_VOICE}`,
            pace: GEMINI_SPEED,
            boundary: "sentence",
          });
        }
        return {voice: GEMINI_VOICE, model, results};
      }

      const text = sentences.map((sentence) => sentence.speech).join("\n");
      const speech = await geminiSpeech(text, GEMINI_VOICE, model);
      if (speech.format !== "wav") {
        throw new Error(`Gemini returned ${speech.format}, expected WAV`);
      }

      const trimmed = trimWavSilence(speech.buffer);
      const weights = sentences.map((sentence) => sentence.speech.length);
      const results = geminiPart(trimmed.buffer, weights);
      if (!results) throw new Error("could not split Gemini narration by sentence");

      const estimated = results.filter((item) =>
        String(item.boundary).startsWith("estimate")
      ).length;
      if (estimated) {
        console.warn(
          `[tts] Gemini: ${estimated}/${results.length} sentence boundaries estimated (few pauses in audio)`
        );
      }

      return {voice: GEMINI_VOICE, model, results};
    } catch (error) {
      failures.push(`gemini(${model}): ${error.message}`);
      if (error.daily) {
        console.warn(`[tts] Gemini ${model} daily quota is gone — trying next model`);
        continue;
      }
      console.warn(`[tts] Gemini ${model} failed: ${error.message}`);
      if (error.status === 401 || error.status === 403) return null;
      continue;
    }
  }

  return null;
}

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
      )}) — narration fell back to the Google Hebrew WaveNet voice.`
    );
    return null;
  }
}

function providerOrder() {
  const preference = String(process.env.TTS_PROVIDER || "auto").toLowerCase();
  if (preference === "gemini") return [runGemini, runGoogle, runElevenLabs];
  if (preference === "google") return [runGoogle, runElevenLabs, runGemini];
  if (preference === "elevenlabs")
    return [runElevenLabs, runGemini, runGoogle];
  // auto: Gemini TTS קודם (קול עברי טבעי ואנרגטי), אחריו ElevenLabs אם
  // נבחר קול מפורש, ובסוף WaveNet — כדי שרינדור לא ייפול על אודיו.
  if (process.env.ELEVENLABS_VOICE_ID)
    return [runGemini, runElevenLabs, runGoogle];
  return [runGemini, runGoogle, runElevenLabs];
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
    "No TTS provider worked. Set GEMINI_API_KEY (Gemini TTS), " +
      "GOOGLE_TTS_API_KEY (Cloud TTS) or ELEVENLABS_API_KEY.\n" +
      failures.map((line) => ` - ${line}`).join("\n")
  );
}

module.exports = {
  synthesizeSentences,
  HE_VOICES,
  GOOGLE_VOICES,
  GEMINI_VOICE,
  GEMINI_MODEL,
  isChirp,
  clampSpeed,
};
