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
    {text: 'הבית שלכם מתלכלך מהר מדי?', from: 6, to: 90, sentence: 0},
    {text: 'אתם מנקים, וחצי שעה אחר כך', from: 90, to: 160, sentence: 1},
    {text: 'דירוג ארבע נקודה שמונה מתוך חמישה', from: 160, to: 260, sentence: 2},
    {text: 'תגיבו מטהר ואני שולח לכם לינק לרכישה', from: 260, to: 340, sentence: 3},
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
