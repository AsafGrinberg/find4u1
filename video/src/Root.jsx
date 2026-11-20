import React from 'react';
import {Composition} from 'remotion';
import {Reel} from './Reel';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

// ברירת מחדל שמאפשרת לפתוח את הסטודיו בלי קלט מהסקריפט.
const defaultProps = {
  brand: 'Find4U',
  site: 'find4u.vercel.app',
  title: 'מטהר אוויר חכם לבית',
  category: 'מטהרי אוויר',
  price: '129.90 ₪',
  originalPrice: '219.00 ₪',
  discount: '41% הנחה',
  keyword: 'מטהר',
  video: '',
  videoFrames: 720,
  audioSegments: [],
  audioStartFrame: 6,
  audioFrames: 600,
  clips: [],
  captions: [
    {text: 'מרגישים שהאוויר בבית כבד?', from: 6, to: 80, sentence: 0},
    {text: 'אבק על המדפים כל יומיים', from: 80, to: 150, sentence: 1},
    {text: 'וריח סגור שלא יוצא מהחדר', from: 150, to: 230, sentence: 1},
    {text: 'מטהר אוויר קטן שמסנן אבק ופרוות', from: 230, to: 330, sentence: 2},
    {text: 'ומחזיר אוויר נקי לחדר', from: 330, to: 400, sentence: 2},
    {text: 'תגיבו מטהר ואשלח לכם לינק לרכישה', from: 400, to: 500, sentence: 3},
  ],
  heroEnd: 96,
  outroStart: 600,
  totalFrames: 645,
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="ProductReel"
      component={Reel}
      durationInFrames={defaultProps.totalFrames}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={defaultProps}
      calculateMetadata={({props}) => {
        return {
          durationInFrames:
            Number(props && props.totalFrames) || defaultProps.totalFrames,
          fps: FPS,
          width: WIDTH,
          height: HEIGHT,
        };
      }}
    />
  );
};
