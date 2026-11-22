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
// יותר קליפים מזה הופכים את הריל לג'יטר. פחות מזה מאלץ להאיץ שוט
// אחד על פני כמה משפטים.
const MAX_CLIPS = 8;
// האטה עדינה של שוט קצר עדיפה על לופ שחוזר על עצמו באמצע משפט.
const MIN_PLAYBACK_RATE = 0.55;
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
 * שוטים תקינים: בתוך גבולות הסרטון, לפחות פריים אחד.
 * @returns {Array<{start:number, frames:number}>|null}
 */
function normalizeShots(shots, videoFrames) {
  const list = (Array.isArray(shots) ? shots : [])
    .filter((shot) => shot && shot.start < videoFrames && shot.frames >= 1)
    .map((shot) => {
      const start = Math.max(0, Math.round(shot.start));
      return {
        start,
        frames: Math.max(1, Math.min(Math.round(shot.frames), videoFrames - start)),
      };
    });

  return list.length ? list : null;
}

/** נפילה לאחור: חלוקה שווה כשאין זיהוי שוטים. */
function evenShots(videoFrames, count) {
  const total = Math.max(1, Math.min(Math.max(1, count), videoFrames));
  const list = [];
  let start = 0;
  for (let i = 0; i < total; i += 1) {
    const end =
      i === total - 1 ? videoFrames : Math.round(((i + 1) / total) * videoFrames);
    list.push({start, frames: Math.max(1, end - start)});
    start = end;
  }
  return list;
}

/**
 * בוחר את השוטים הארוכים (הקצרים הם לרוב הבהוב מעבר), ומחזיר את ההוק
 * ראשון — השוט הארוך ביותר — ואחריו השאר לפי סדר המקור.
 */
function chooseShots(shots, wanted) {
  const picked = [...shots]
    .sort((a, b) => b.frames - a.frames)
    .slice(0, Math.max(1, Math.min(wanted, shots.length)));
  const [hero, ...rest] = picked;
  return [hero, ...rest.sort((a, b) => a.start - b.start)];
}

/**
 * מחלק את משפטי הקריינות (חוץ מההוק) לקבוצות רצופות, אחת לכל קליפ.
 * הקבוצה גדלה לפי אורך השוט: שוט של 6 שניות מחזיק שלושה משפטים ושוט של
 * שתיים מחזיק אחד — כך הקליפ ממלא את הזמן שלו בלי להאיץ ובלי לחזור על
 * עצמו. כל קליפ מתחלף בהתחלה של משפט — לא באמצע מילה.
 */
function clipSlots(timings, shots) {
  const rest = timings.slice(1);
  if (!rest.length || !shots.length) return [];

  const groups = Math.min(shots.length, rest.length);
  const weights = shots.slice(0, groups).map((shot) => Math.max(1, shot.frames));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  // עיגול על המצברים ולא על כל קבוצה: מינימום של משפט לקבוצה היה מנפח
  // את השוטים הקצרים והיה מותיר את השוט הארוך בלי מספיק משפטים.
  const sizes = [];
  let weightSoFar = 0;
  let sentenceSoFar = 0;
  for (let i = 0; i < groups; i += 1) {
    weightSoFar += weights[i];
    const target = Math.round((weightSoFar / totalWeight) * rest.length);
    sizes.push(Math.max(0, target - sentenceSoFar));
    sentenceSoFar = target;
  }

  // משפט לא נשאר בלי קליפ, וקליפ לא נשאר בלי משפט.
  for (let i = 0; i < sizes.length; i += 1) {
    if (sizes[i] > 0) continue;
    const donor = sizes.indexOf(Math.max(...sizes));
    if (sizes[donor] > 1) {
      sizes[i] += 1;
      sizes[donor] -= 1;
    }
  }

  const plan = [];
  let cursor = 0;
  for (let i = 0; i < sizes.length; i += 1) {
    const size = sizes[i];
    if (size <= 0 || cursor >= rest.length) continue;
    plan.push({shot: shots[i], from: rest[cursor].from});
    cursor += size;
  }

  return plan.map((slot, index) => ({
    shot: slot.shot,
    from: slot.from,
    to:
      index + 1 < plan.length ? plan[index + 1].from : rest[rest.length - 1].to,
  }));
}

function makeClip(index, from, to, shot, layout) {
  const screenFrames = Math.max(1, Math.round(to - from));
  const playbackRate = Math.max(
    MIN_PLAYBACK_RATE,
    Math.min(1, shot.frames / screenFrames)
  );
  return {
    index,
    from: Math.round(from),
    durationInFrames: screenFrames,
    clipStart: shot.start,
    // לא מבקשים מהמקור פריים שאין בו — זה מפיל את הרינדור.
    clipFrames: shot.frames,
    playbackRate: Number(playbackRate.toFixed(3)),
    // הלופ נגמר בדיוק בסוף הקליפ, ולכן בפועל אין חזרה על אותה תנועה.
    loopFrames: Math.max(1, Math.round(shot.frames / playbackRate)),
    layout,
  };
}

/**
 * קליפ לכל שוט אמיתי מהסרטון, לא לכל משפט. שוט קצר מהזמן שלו מואט
 * בעדינות (עד 0.55x) כדי למלא אותו בלי לחזור על אותה תנועה.
 */
function buildClips({timings, heroEnd, audioEnd, videoFrames, shots, fps}) {
  const source = normalizeShots(shots, videoFrames) || evenShots(videoFrames, 5);
  // כל שוט אמיתי מקבל קליפ משלו (עד התקרה) — קליפ קצר ושני שוטים קצרים
  // עדיפים על שוט אחד שנמתח על ארבעה משפטים ומואץ עד 0.55x.
  const kept = chooseShots(source, Math.min(MAX_CLIPS, source.length));
  const slots = clipSlots(timings, kept.slice(1));

  const clips = [makeClip(0, 0, heroEnd, kept[0], "hero")];
  slots.forEach((slot, index) => {
    if (slot.to <= slot.from) return;
    clips.push(makeClip(index + 1, slot.from, slot.to, slot.shot, "card"));
  });

  // אחרי הקליפ האחרון אין קליפ שיכסה את שארית הקריינות (כשהיו פחות
  // שוטים מהקבוצות) — האחרון נמתח עד סוף הדיבור.
  const last = clips[clips.length - 1];
  if (last && last.from + last.durationInFrames < audioEnd) {
    clips[clips.length - 1] = makeClip(
      last.index,
      last.from,
      audioEnd,
      {start: last.clipStart, frames: last.clipFrames},
      last.layout
    );
  }

  return clips;
}

/**
 * @param {object} options
 * @param {Array} options.sentences   משפטים מ-buildScript (role, speech, gapAfterMs)
 * @param {number[]} options.durations משך אפקטיבי בשניות לכל משפט
 * @param {number} options.videoFrames אורך סרטון המוצר בפריימים
 * @param {Array} [options.shots]     שוטים אמיתיים מהסרטון ({start, frames})
 * @param {number} [options.fps=30]
 * @param {number} [options.leadInFrames] פריימים לפני שהדיבור מתחיל
 * @param {number} [options.outroFrames]  אורך מסך הסיום
 */
function buildTimeline({
  sentences,
  durations,
  videoFrames,
  shots,
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

  // ---- 3. קליפים: על גבולות השוטים האמיתיים של הסרטון -----------------
  // קודם הסרטון נחתך לפרוסה שווה לכל משפט — עשרה חיתוכים באמצע תנועה עם
  // לופ שחוזר על עצמו. עכשיו כל קליפ הוא שוט אמיתי, מחזיק כמה משפטים,
  // ומתחלף בהתחלת משפט כדי שהמעבר ייראה מכוון.
  const safeVideoFrames = Math.max(1, Math.round(Number(videoFrames) || 1));

  // ההוק (המשפט הראשון) הוא ויז'ואל full-bleed, עד שהמשפט השני מתחיל.
  const heroEnd = count > 1 ? timings[1].from : timings[0].to;

  const clips = buildClips({
    timings,
    heroEnd,
    audioEnd,
    videoFrames: safeVideoFrames,
    shots,
    fps,
  });

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

module.exports = {
  buildTimeline,
  buildClips,
  phrasesOf,
  chunkPhrase,
  MIN_CUE_FRAMES,
};
