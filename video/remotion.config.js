const {Config} = require('@remotion/cli/config');

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(90);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('swangle');
