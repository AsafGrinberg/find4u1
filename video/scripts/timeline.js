"use strict";

/**
 * timeline.js
 * ---------------------------------------------------------------
 * בונה את ציר הזמן של הריל מתוך משך האודיו שנמדד בפועל לכל משפט.
 *
 * למה זה חשוב: הכתוביות והחלפות הקליפים חייבות להיות מסונכרנות
 * לקריינות. בקוד הקודם הן חולקו לפי אורך טקסט מול אודיו אחד ארוך,
 * ולכן הכתוביות "החליקו" מול הדיבור. עכשיו כל משפט הוא קובץ אודיו
 * משלו, יש לו משך אמיתי, ומכאן נגזרים גם הכתוביות, גם הקליפים
 * וגם אורך הסרטון (בלי זנב שקט מיותר).
 *
 * הפלט (inputProps ל-Remotion):
 *   audioSegments — קובץ, פריים התחלה, אורך, playbackRate
 *   captions      — ביטוי אחד בכל פעם, טקסט מדויק של מה שנאמר
 *   clips         — לכל משפט מקטע אחר מסרטון המוצר + סוג פריסה
 *   heroEnd, outroStart, totalFrames
 */

const MIN_CUE_FRAMES = 12; // ביטוי קצר מדי מהבהב על המסך
const MIN_PHRASE_CHARS = 12;
// כתובית ארוכה מדי נקראת כמו פסקה. מפצלים לחלקים של עד ארבע מילים.
const MAX_CUE_CHARS = 28;
const MAX_CUE_WORDS = 4;
// מילים שקוטעות משפט באמצע ("כמה פעמים בלילה | אתם מחפשים"): לא
// מסיימים בהן כתובית, מעבירים אותן לכתובית הבאה.
const BIND_FORWARD = new Set([
  "אתם",
  "אתן",
  "אתה",
  "אני",
  "אנחנו",
  "את",
  "של",
  "עם",
  "על",
  "אל",
  "ב",
  "ל",
  "כי",
  "אז",
  "גם",
  "כל",
  "זה",
  "יש",
  "אין",
  "הוא",
  "היא",
  "אבל",
  "או",
  "כמו",
  "יותר",
  "לא",
  "עד",
]);

const BIND_BACKWARD = new Set([
  "אתכם",
  "אתכן",
  "אותך",
  "אותו",
  "אותה",
  "אותם",
  "אותן",
  "לי",
  "לך",
  "לנו",
]);

/**
 * מפצל ביטוי ארוך לחלקים קצרים על גבולות מילים. כל חלק הוא מחרוזת
 * רציפה מתוך הביטוי עצמו — כלומר עדיין ציטוט מדויק של מה שנאמר.
 */
function chunkPhrase(phrase) {
  const words = String(phrase).split(/\s+/).filter(Boolean);
  if (words.length <= MAX_CUE_WORDS && phrase.length <= MAX_CUE_CHARS) {
    return [phrase];
  }

  const chunks = [];
  let current = [];

  for (const word of words) {
    const candidate = [...current, word].join(" ");
    const tooLong =
      current.length > 0 &&
      (candidate.length > MAX_CUE_CHARS || current.length >= MAX_CUE_WORDS);
    if (tooLong) {
      chunks.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) chunks.push(current.join(" "));

  // מילה שקוטעת משפט לא נשארת בסוף הכתובית. חוזרים על המעבר, כי
  // הזזת מילה אחת משאירה לפעמים מילה קוטעת חדשה בסוף הכתובית שלפניה.
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (let i = 0; i < chunks.length - 1; i += 1) {
      const words = chunks[i].split(" ");
      if (words.length > 1 && BIND_FORWARD.has(words[words.length - 1])) {
        chunks[i] = words.slice(0, -1).join(" ");
        chunks[i + 1] = `${words[words.length - 1]} ${chunks[i + 1]}`;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // מושא ("מעירה | אתכם לגמרי") שייך לפועל שלפניו.
  for (let i = 1; i < chunks.length; i += 1) {
    const words = chunks[i].split(" ");
    if (BIND_BACKWARD.has(words[0]) && words.length > 1) {
      chunks[i - 1] = `${chunks[i - 1]} ${words.shift()}`;
      chunks[i] = words.join(" ");
    }
  }

  // חלק קצר מדי (מילה בודדת בסוף) מתאחד עם הקודם, אלא אם הוא כבר ארוך.
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 6) {
    const last = chunks.pop();
    const merged = `${chunks[chunks.length - 1]} ${last}`;
    if (merged.length <= MAX_CUE_CHARS + 8) chunks[chunks.length - 1] = merged;
    else chunks.push(last);
  }

  return chunks;
}

/**
 * מפצל משפט לביטויים לפי פסיק/נקודתיים/מקף, ואז לחלקים קצרים, כדי
 * שהכתובית תציג ביטוי אחד בכל פעם — אבל תמיד ציטוט מדויק של מה שנאמר.
 */
function phrasesOf(speech) {
  const text = String(speech);
  const ranges = [];
  const splitter = /[,;—]\s+/g;
  let last = 0;
  let match;

  while ((match = splitter.exec(text))) {
    ranges.push([last, match.index]);
    last = match.index + match[0].length;
  }
  ranges.push([last, text.length]);

  // מאחדים ביטוי קצר מדי עם הקודם (פותחים את הטווח, לא מדביקים
  // מחרוזות) — כדי שהביטוי יישאר ציטוט מדויק של מה שנאמר.
  const merged = [];
  for (const [start, end] of ranges) {
    const phrase = text.slice(start, end).trim();
    if (!phrase) continue;
    if (merged.length && phrase.length < MIN_PHRASE_CHARS) {
      merged[merged.length - 1][1] = end;
    } else {
      merged.push([start, end]);
    }
  }

  const phrases = merged
    .map(([start, end]) =>
      text.slice(start, end).replace(/[\s,;—.]+$/u, "").trim()
    )
    .flatMap(chunkPhrase);

  return phrases.length ? phrases : [text.replace(/[.\s]+$/, "")];
}

/**
 * @param {object} options
 * @param {Array} options.sentences   משפטים מ-buildScript (role, speech, gapAfterMs)
 * @param {number[]} options.durations משך אפקטיבי בשניות לכל משפט
 * @param {number} options.videoFrames אורך סרטון המוצר בפריימים
 * @param {number} [options.fps=30]
 * @param {number} [options.leadInFrames] פריימים לפני שהדיבור מתחיל
 * @param {number} [options.outroFrames]  אורך מסך הסיום
 */
function buildTimeline({
  sentences,
  durations,
  videoFrames,
  fps = 30,
  leadInFrames = 6,
  outroFrames = 45,
}) {
  if (!sentences.length) throw new Error("timeline: no sentences");
  if (durations.length !== sentences.length) {
    throw new Error("timeline: durations do not match sentences");
  }

  // ---- 1. זמן לכל משפט -------------------------------------------------
  const timings = [];
  let cursor = leadInFrames;

  sentences.forEach((sentence, index) => {
    const frames = Math.max(1, Math.ceil(durations[index] * fps));
    const from = cursor;
    const to = from + frames;
    const gapFrames = Math.max(
      0,
      Math.round(((sentence.gapAfterMs || 0) / 1000) * fps)
    );
    timings.push({from, to, frames, gapFrames});
    cursor = to + gapFrames;
  });

  const count = timings.length;
  const audioEnd = timings[count - 1].to;
  const outroStart = audioEnd;
  const totalFrames = outroStart + outroFrames;

  // ---- 2. סגמנטים של אודיו --------------------------------------------
  const audioSegments = timings.map((timing, index) => ({
    index,
    from: timing.from,
    durationInFrames: timing.frames,
    silenceAfterFrames: timing.gapFrames,
  }));

  // ---- 3. קליפים: כל משפט מקבל מקטע אחר של סרטון המוצר ----------------
  // הסרטון של המוכר קצר מהקריינות, לכן מחלקים אותו למקטעים לפי מספר
  // המשפטים. כל מקטע מוצג בזמן שהמשפט שמדבר עליו נאמר (ומסתובב
  // בלופ אם המשפט ארוך ממנו), וממשיך עד המשפט הבא כדי שלא יהיו חורים.
  const safeVideoFrames = Math.max(1, Number(videoFrames) || 1);
  const clips = timings.map((timing, index) => {
    const from = timing.from;
    const to = index + 1 < count ? timings[index + 1].from : timing.to;
    const start = Math.min(
      Math.floor((index / count) * safeVideoFrames),
      safeVideoFrames - 1
    );
    const end = Math.min(
      Math.floor(((index + 1) / count) * safeVideoFrames),
      safeVideoFrames
    );
    return {
      index,
      from,
      durationInFrames: Math.max(1, to - from),
      clipStart: start,
      // לא מבקשים מהמקור פריים שאין בו — זה מפיל את הרינדור.
      clipFrames: Math.max(1, Math.min(end - start, safeVideoFrames - start)),
      layout: index === 0 ? "hero" : "card",
    };
  });

  // ההוק (המשפט הראשון) הוא ויז'ואל full-bleed, עד שהמשפט השני מתחיל.
  const heroEnd = count > 1 ? timings[1].from : timings[0].to;

  // ---- 4. כתוביות: ביטוי אחד בכל פעם, ציטוט מדויק ---------------------
  const captions = [];
  sentences.forEach((sentence, index) => {
    const timing = timings[index];
    const nextFrom =
      index + 1 < count ? timings[index + 1].from : timing.to;
    const phrases = phrasesOf(sentence.speech);
    const weights = phrases.map((phrase) => Math.max(1, phrase.length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);

    let phraseCursor = timing.from;
    phrases.forEach((phrase, phraseIndex) => {
      const share = (weights[phraseIndex] / totalWeight) * timing.frames;
      const from = Math.round(phraseCursor);
      phraseCursor += share;
      const last = phraseIndex === phrases.length - 1;
      // הביטוי האחרון נשאר עד שהמשפט הבא מתחיל — בלי הבהוב בהפסקה.
      const to = last ? nextFrom : Math.round(phraseCursor);
      captions.push({
        text: phrase,
        from,
        to: Math.max(to, Math.min(from + MIN_CUE_FRAMES, timing.to)),
        sentence: index,
      });
    });
  });

  return {
    timings,
    audioSegments,
    clips,
    captions,
    heroEnd,
    audioStartFrame: leadInFrames,
    audioEndFrame: audioEnd,
    outroStart,
    totalFrames,
  };
}

module.exports = {buildTimeline, phrasesOf, chunkPhrase, MIN_CUE_FRAMES};
