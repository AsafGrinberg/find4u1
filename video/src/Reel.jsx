import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
const Logo = ({frame, opacity = 1}) => (
  <div
    style={{
      position: 'absolute',
      top: 90,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      direction: 'ltr',
      opacity,
      fontFamily: FONT,
      fontWeight: 800,
      fontSize: 62,
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

/**
 * סרטון המוצר עצמו הוא הבסיס לריל.
 * שכבת רקע: אותו סרטון מוגדל ומטושטש, כדי למלא את המסך האנכי בלי
 * לחתוך את המוצר. מעליה כרטיס חד עם הסרטון בשלמותו (contain).
 * הקול המקורי של הסרטון מושתק — הקריינות שלנו היא הפסקול.
 */
const ProductVideo = ({src, frames, start}) => {
  const frame = useCurrentFrame();
  if (!src) return null;

  const fade = interpolate(frame, [start - 8, start + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const file = staticFile(src);
  const loopFrames = Math.max(1, Number(frames) || 240);

  return (
    <AbsoluteFill style={{opacity: fade}}>
      <Loop durationInFrames={loopFrames}>
        <OffthreadVideo
          src={file}
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(42px) saturate(1.2)',
            transform: 'scale(1.2)',
          }}
        />
      </Loop>

      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(6,9,18,.72) 0%, rgba(6,9,18,.18) 26%, rgba(6,9,18,.32) 56%, rgba(6,9,18,.9) 80%, rgba(6,9,18,.97) 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 248,
          left: 90,
          width: 900,
          height: 860,
          borderRadius: 52,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,.10)',
          boxShadow: '0 40px 90px rgba(0,0,0,.55)',
        }}
      >
        <Loop durationInFrames={loopFrames}>
          <OffthreadVideo
            src={file}
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </Loop>
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
        top: 1140,
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
          padding: '10px 26px',
          borderRadius: 999,
          background: 'rgba(255,255,255,.10)',
          border: '1px solid rgba(255,255,255,.18)',
          color: COLORS.muted,
          fontSize: 34,
          fontWeight: 700,
          marginBottom: 18,
        }}
      >
        {props.category}
      </div>

      <div
        style={{
          color: COLORS.white,
          fontSize: 54,
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
          marginTop: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          direction: 'rtl',
        }}
      >
        <div
          style={{
            padding: '16px 40px',
            borderRadius: 28,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDeep})`,
            color: COLORS.white,
            fontSize: 76,
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
              fontSize: 44,
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
              fontSize: 30,
              whiteSpace: 'nowrap',
              fontWeight: 800,
              transform: 'rotate(-4deg)',
            }}
          >
            {props.discount}
          </div>
        ) : null}
      </div>

      {props.social ? (
        <div
          style={{
            marginTop: 16,
            color: COLORS.gold,
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          {props.social}
        </div>
      ) : null}
    </div>
  );
};

// ---- כתוביות שרופות ----------------------------------------------------
const Captions = ({captions}) => {
  const frame = useCurrentFrame();
  const active = (captions || []).find(
    (line) => frame >= line.from && frame < line.to
  );
  if (!active) return null;

  const fadeIn = interpolate(frame, [active.from, active.from + 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [active.to - 6, active.to],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 1600,
        left: 70,
        width: 940,
        display: 'flex',
        justifyContent: 'center',
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      <div
        style={{
          direction: 'rtl',
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 46,
          lineHeight: 1.3,
          color: COLORS.white,
          textAlign: 'center',
          padding: '18px 30px',
          borderRadius: 22,
          background: 'rgba(0,0,0,.55)',
          border: '1px solid rgba(255,255,255,.12)',
          maxWidth: 940,
        }}
      >
        {active.text}
      </div>
    </div>
  );
};

// ---- סיום: קריאה לפעולה ------------------------------------------------
const Outro = ({props, start}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const appear = spring({frame: frame - start, fps, config: {damping: 200}});
  if (frame < start) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity: appear,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(6,9,18,.86)',
        }}
      />
      <div
        style={{
          position: 'relative',
          direction: 'rtl',
          textAlign: 'center',
          fontFamily: FONT,
          transform: `scale(${0.94 + appear * 0.06})`,
        }}
      >
        <div style={{fontSize: 130, marginBottom: 10}}>🛒</div>
        <div
          style={{
            color: COLORS.white,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.15,
          }}
        >
          הקישור בתיאור
        </div>
        <div
          style={{
            marginTop: 26,
            display: 'inline-block',
            padding: '18px 44px',
            borderRadius: 26,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDeep})`,
            color: COLORS.white,
            fontSize: 52,
            fontWeight: 800,
            direction: 'ltr',
          }}
        >
          {props.site}
        </div>
        <div
          style={{
            marginTop: 26,
            color: COLORS.muted,
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          משלוח לישראל · מחירים מתעדכנים
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- הקומפוזיציה -------------------------------------------------------
export const Reel = (props) => {
  const frame = useCurrentFrame();
  const audioStart = Number(props.audioStartFrame) || 0;
  const audioEnd = audioStart + (Number(props.audioFrames) || 0);
  const outroStart = audioEnd;
  const introFade = interpolate(frame, [0, 12, audioStart + 6, audioStart + 18], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: COLORS.bg}}>
      <Backdrop frame={frame} />

      <ProductVideo
        src={props.video}
        frames={props.videoFrames}
        start={audioStart - 14}
      />

      {props.audio ? (
        <Audio src={staticFile(props.audio)} startFrom={0} />
      ) : null}

      <Logo frame={frame} />

      {frame >= audioStart + 6 && frame < outroStart ? (
        <>
          <ProductInfo props={props} from={audioStart + 6} />
          <Captions captions={props.captions} />
        </>
      ) : null}

      {/* ההוק יושב מעל הווידאו, כדי שיהיה קריא בפתיחה */}
      {frame < audioStart + 18 ? (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            opacity: introFade,
            direction: 'rtl',
            textAlign: 'center',
            fontFamily: FONT,
          }}
        >
          <div
            style={{
              color: COLORS.white,
              fontSize: 92,
              fontWeight: 800,
              lineHeight: 1.12,
            }}
          >
            מצאתי
            <br />
            לך את זה
          </div>
          <div
            style={{
              marginTop: 24,
              padding: '14px 34px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.1)',
              border: '1px solid rgba(255,255,255,.2)',
              color: COLORS.gold,
              fontSize: 38,
              fontWeight: 700,
            }}
          >
            {props.category}
          </div>
        </AbsoluteFill>
      ) : null}

      <Outro props={props} start={outroStart} />
    </AbsoluteFill>
  );
};
