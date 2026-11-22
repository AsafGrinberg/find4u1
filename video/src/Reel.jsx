import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {COLORS, FONT} from './theme';

// Heebo הוא פונט משתנה — קובץ אחד מכסה את כל המשקלים בעברית.
loadFont({
  family: 'Heebo',
  url: staticFile('fonts/Heebo-Variable.ttf'),
  weight: '100 900',
});

// ---- רקע: גרדיאנט כהה עם שתי הילות שמתנועעות לאט -----------------------
const Backdrop = ({frame}) => {
  const drift = Math.sin(frame / 90) * 60;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.bg} 0%, ${COLORS.bgSoft} 55%, ${COLORS.bg} 100%)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -260 + drift,
          left: -180,
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.accent}44 0%, ${COLORS.accent}18 38%, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -320 - drift,
          right: -220,
          width: 1000,
          height: 1000,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.accentDeep}44 0%, ${COLORS.accentDeep}18 38%, transparent 62%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ---- לוגו ---------------------------------------------------------------
const Logo = ({opacity = 1}) => (
  <div
    style={{
      position: 'absolute',
      top: 78,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      direction: 'ltr',
      opacity,
      fontFamily: FONT,
      fontWeight: 800,
      fontSize: 54,
      color: COLORS.white,
      letterSpacing: '-1px',
    }}
  >
    <span>Find</span>
    <span style={{position: 'relative', color: COLORS.accent}}>
      4U
      <svg
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          top: '.14em',
          right: '-.68em',
          width: '.62em',
          height: '.62em',
        }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
        />
        <circle cx="8.6" cy="9.7" r="1.8" fill="currentColor" />
        <circle cx="15.4" cy="9.7" r="1.8" fill="currentColor" />
        <path
          d="M7.2 13.8c1.3 2.2 3.1 3.3 4.8 3.3s3.5-1.1 4.8-3.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  </div>
);

// ---- קליפ full-bleed להוק ----------------------------------------------
// השנייה־שתיים הראשונות הן הוויז'ואל החזק ביותר: הסרטון ממלא את המסך
// (בלי מסגרת ובלי כרטיסים), עם זום איטי פנימה וטקסט ההוק מעליו.
const HeroClip = ({clip, src}) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, Math.max(1, clip.durationInFrames)], [1.06, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {/* מקטע המקור קצר מהמשפט, לכן הוא מואט בעדינות ממלא את המקטע
          שלו (playbackRate מהציר) ורק אז חוזר על עצמו, אם בכלל. */}
      <Loop durationInFrames={Math.max(1, clip.loopFrames || clip.clipFrames)}>
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={clip.clipStart}
          playbackRate={clip.playbackRate || 1}
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${zoom})`,
          }}
        />
      </Loop>
      {/* מרככים את הקליפ ומכסים כתוביות לועזיות חרוטות בתחתית המקור */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(6,9,18,.70) 0%, rgba(6,9,18,.55) 12%, rgba(6,9,18,.10) 34%, rgba(6,9,18,.45) 62%, rgba(6,9,18,.92) 84%, #060912 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 210,
          background: `linear-gradient(180deg, transparent 0%, ${COLORS.bg} 72%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ---- כרטיס הסרטון: מקטע אחר לכל משפט ------------------------------------
const CardClip = ({clip, src}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  // כניסה עדינה של כל מקטע — נראה כמו חיתוך עריכה, לא כמו קפיצה.
  const punch = spring({frame, fps, config: {damping: 200}, durationInFrames: 12});
  const scale = 1.04 - punch * 0.04;

  return (
    <AbsoluteFill>
      <Loop durationInFrames={Math.max(1, clip.loopFrames || clip.clipFrames)}>
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={clip.clipStart}
          playbackRate={clip.playbackRate || 1}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            // חיתוך עדין של השוליים: מוציא מהפריים את הפס העליון שבו
            // המוכר שורף לעיתים כתוביות באנגלית.
            transform: `translateY(-4%) scale(${scale * 1.14})`,
          }}
        />
      </Loop>
      {/* פס כהה עליון — מכסה כתוביות חרוטות בחלק העליון של הקליפ */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '15%',
          background: `linear-gradient(180deg, rgba(6,9,18,.96) 0%, rgba(6,9,18,.72) 55%, rgba(6,9,18,0) 100%)`,
        }}
      />
      {/* כיסוי לכתוביות של המוכר (בסרטון הזה: אנגלית חרוטה בתחתית הקליפ) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '36%',
          background: `linear-gradient(180deg, rgba(6,9,18,0) 0%, rgba(6,9,18,.72) 42%, rgba(6,9,18,.99) 78%, rgba(6,9,18,1) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const ProductVideo = ({props}) => {
  const frame = useCurrentFrame();
  const heroEnd = Number(props.heroEnd) || 0;
  const clips = props.clips || [];
  const cardFrom = heroEnd;

  const cardAppear = spring({
    frame: frame - cardFrom,
    fps: 30,
    config: {damping: 200},
    durationInFrames: 18,
  });

  return (
    <AbsoluteFill>
      {clips
        .filter((clip) => clip.layout === 'hero')
        .map((clip) => (
          <Sequence
            key={`hero-${clip.index}`}
            from={clip.from}
            durationInFrames={clip.durationInFrames}
          >
            <HeroClip clip={clip} src={props.video} />
          </Sequence>
        ))}

      {frame >= cardFrom ? (
        <div
          style={{
            position: 'absolute',
            top: 210,
            left: 90,
            width: 900,
            height: 900,
            borderRadius: 52,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.10)',
            boxShadow: '0 40px 90px rgba(0,0,0,.55)',
            opacity: cardAppear,
            transform: `translateY(${(1 - cardAppear) * 30}px) scale(${
              0.96 + cardAppear * 0.04
            })`,
          }}
        >
          {clips
            .filter((clip) => clip.layout === 'card')
            .map((clip) => (
              <Sequence
                key={`card-${clip.index}`}
                from={clip.from}
                durationInFrames={clip.durationInFrames}
              >
                <CardClip clip={clip} src={props.video} />
              </Sequence>
            ))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---- טקסט ההוק מעל הוויז'ואל החזק --------------------------------------
// ההוק מופיע בפריים הראשון (0.2s), לא בכרטיס פתיחה.
const HeroText = ({props}) => {
  const frame = useCurrentFrame();
  const active = (props.captions || []).find(
    (line) => frame >= line.from && frame < line.to
  );
  const appear = interpolate(frame, [0, 6], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 520,
        direction: 'rtl',
        textAlign: 'center',
        fontFamily: FONT,
        opacity: appear,
      }}
    >
      <div
        style={{
          color: COLORS.white,
          fontSize: 96,
          fontWeight: 800,
          lineHeight: 1.12,
          maxWidth: 920,
          textShadow: '0 10px 34px rgba(0,0,0,.75)',
        }}
      >
        {active ? active.text : ''}
      </div>
      <div
        style={{
          marginTop: 28,
          padding: '12px 32px',
          borderRadius: 999,
          background: 'rgba(6,9,18,.55)',
          border: '1px solid rgba(255,255,255,.22)',
          color: COLORS.gold,
          fontSize: 36,
          fontWeight: 700,
        }}
      >
        {props.category}
      </div>
    </AbsoluteFill>
  );
};

// ---- כרטיס הטקסט: שם, מחיר, דירוג --------------------------------------
const ProductInfo = ({props, from}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const appear = spring({
    frame: frame - from,
    fps,
    config: {damping: 200},
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 1130,
        left: 80,
        width: 920,
        direction: 'rtl',
        textAlign: 'center',
        fontFamily: FONT,
        opacity: appear,
        transform: `translateY(${(1 - appear) * 40}px)`,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          padding: '8px 24px',
          borderRadius: 999,
          background: 'rgba(255,255,255,.10)',
          border: '1px solid rgba(255,255,255,.18)',
          color: COLORS.muted,
          fontSize: 32,
          fontWeight: 700,
          marginBottom: 14,
        }}
      >
        {props.category}
      </div>

      <div
        style={{
          color: COLORS.white,
          fontSize: 52,
          lineHeight: 1.18,
          fontWeight: 800,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {props.title}
      </div>

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          direction: 'rtl',
        }}
      >
        <div
          style={{
            padding: '14px 36px',
            borderRadius: 26,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDeep})`,
            color: COLORS.white,
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: '-1px',
            boxShadow: '0 18px 40px rgba(255,45,85,.35)',
          }}
        >
          {props.price}
        </div>

        {props.originalPrice ? (
          <div
            style={{
              color: COLORS.muted,
              fontSize: 42,
              fontWeight: 700,
              textDecoration: 'line-through',
              opacity: 0.85,
            }}
          >
            {props.originalPrice}
          </div>
        ) : null}

        {props.discount ? (
          <div
            style={{
              padding: '8px 16px',
              borderRadius: 18,
              background: COLORS.gold,
              color: '#3a2500',
              fontSize: 28,
              whiteSpace: 'nowrap',
              fontWeight: 800,
              transform: 'rotate(-4deg)',
            }}
          >
            {props.discount}
          </div>
        ) : null}
      </div>

    </div>
  );
};

// ---- כתוביות שרופות: ביטוי אחד בכל פעם, ציטוט מדויק ---------------------
const Captions = ({captions}) => {
  const frame = useCurrentFrame();
  const active = (captions || []).find(
    (line) => frame >= line.from && frame < line.to
  );
  if (!active) return null;

  const fadeIn = interpolate(frame, [active.from, active.from + 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [active.to - 5, active.to],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 1585,
        left: 60,
        width: 960,
        display: 'flex',
        justifyContent: 'center',
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      <div
        style={{
          direction: 'rtl',
          unicodeBidi: 'plaintext',
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 48,
          lineHeight: 1.28,
          color: COLORS.white,
          textAlign: 'center',
          padding: '16px 30px',
          borderRadius: 22,
          background: 'rgba(0,0,0,.58)',
          border: '1px solid rgba(255,255,255,.12)',
          maxWidth: 960,
        }}
      >
        {active.text}
      </div>
    </div>
  );
};

// ---- סיום: קריאה לפעולה אחת, קצרה --------------------------------------
const Outro = ({props, start}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const appear = spring({frame: frame - start, fps, config: {damping: 200}});
  if (frame < start) return null;

  return (
    <AbsoluteFill style={{opacity: appear}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(6,9,18,.88)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          direction: 'rtl',
          textAlign: 'center',
          fontFamily: FONT,
          transform: `scale(${0.94 + appear * 0.06})`,
        }}
      >
        <div
          style={{
            color: COLORS.white,
            fontSize: 62,
            fontWeight: 800,
            lineHeight: 1.2,
          }}
        >
          תגיבו
        </div>
        <div
          style={{
            marginTop: 18,
            padding: '10px 44px',
            borderRadius: 26,
            border: `3px solid ${COLORS.accent}`,
            color: COLORS.white,
            fontSize: 84,
            fontWeight: 800,
          }}
        >
          {props.keyword}
        </div>
        <div
          style={{
            marginTop: 26,
            padding: '16px 40px',
            borderRadius: 24,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDeep})`,
            color: COLORS.white,
            fontSize: 44,
            fontWeight: 800,
          }}
        >
          ואשלח לכם לינק לרכישה
        </div>
        <div
          style={{
            marginTop: 20,
            color: COLORS.muted,
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          משלוח לישראל
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- הקומפוזיציה -------------------------------------------------------
export const Reel = (props) => {
  const frame = useCurrentFrame();
  const heroEnd = Number(props.heroEnd) || 0;
  const outroStart = Number(props.outroStart) || 0;
  const segments = props.audioSegments || [];

  return (
    <AbsoluteFill style={{backgroundColor: COLORS.bg}}>
      <Backdrop frame={frame} />

      {props.video ? <ProductVideo props={props} /> : null}

      {/* קריינות: קובץ לכל משפט, במקום שבו הוא נאמר */}
      {segments.map((segment) => (
        <Sequence
          key={segment.file}
          from={segment.from}
          durationInFrames={segment.durationInFrames}
        >
          <Audio
            src={staticFile(segment.file)}
            playbackRate={Number(segment.playbackRate) || 1}
            preservePitch
          />
        </Sequence>
      ))}

      <Logo />

      {frame < heroEnd ? <HeroText props={props} /> : null}

      {frame >= heroEnd && frame < outroStart ? (
        <>
          <ProductInfo props={props} from={heroEnd + 6} />
          <Captions captions={props.captions} />
        </>
      ) : null}

      <Outro props={props} start={outroStart} />
    </AbsoluteFill>
  );
};
