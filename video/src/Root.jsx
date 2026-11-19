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
  social: 'דירוג 4.8 · 3,214 מכירות',
  images: [],
  audio: '',
  audioStartFrame: 45,
  audioFrames: 600,
  captions: [
    {text: 'מצאתי לך מוצר שווה', from: 45, to: 120},
    {text: 'מטהר אוויר חכם לבית', from: 120, to: 260},
    {text: '129.90 שקל בלבד', from: 260, to: 400},
    {text: 'משלוח לישראל, הקישור בתיאור', from: 400, to: 600},
  ],
  totalFrames: 720,
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
