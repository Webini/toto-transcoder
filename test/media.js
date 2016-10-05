const Media  = require('../src/media.js');
const assert = require('assert');
const _      = require('lodash');

describe('Media', () => {
  const enLanguage = /^(en|us).*/i;
  const frLanguage = /^fr.*/i;
  const ruLanguage = /^ru.*/i;
  const czLanguage = /^cz.*/i;

  describe('#selectBestAV', () => {
    const metadata = require('./resources/metadata-audio-subtitles.json');

    it('Should not be able to found an audio track', () => {
      const media = new Media({});
      assert.throws(() => media.selectPresets(enLanguage));
    }); 

    it('Should select our preferred audio track and forced subtitles', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[1];
      const subtitleNeeded  = metadata.streams[5];

      media.selectBestAV(enLanguage);

      assert.deepStrictEqual(media.best.audio, audioNeeded);
      assert.deepStrictEqual(media.best.subtitle, subtitleNeeded);
    });

    it('Should select first audio track and preferred subtitles', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[0];
      const subtitleNeeded  = metadata.streams[8];

      media.selectBestAV(ruLanguage);

      assert.deepStrictEqual(media.best.audio, audioNeeded);
      assert.deepStrictEqual(media.best.subtitle, subtitleNeeded);
    });

    it('Should select first audio track and fallback to forced subtitles', () => {
      const metadataCpy     = _.clone(metadata, true);
      metadataCpy.streams.splice(8, 1);
      const media           = new Media({ metadata: metadataCpy });
      const audioNeeded     = metadataCpy.streams[0];
      const subtitleNeeded  = metadataCpy.streams[7];
      
      media.selectBestAV(ruLanguage);

      assert.deepStrictEqual(media.best.audio, audioNeeded);
      assert.deepStrictEqual(media.best.subtitle, subtitleNeeded);
    });

    it('No preferred subtitle & audio tracks, fallback to first audio track', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[0];

      media.selectBestAV(czLanguage);

      assert.deepStrictEqual(media.best.audio, audioNeeded);
    });
  });


  describe('#selectVideoTrack', () => {
    const metadata = require('./resources/metadata-video-low.json');

    it('Should not be able to found a video track', () => {
      const media = new Media({});
      assert.throws(() => media.selectVideoTrack());
    }); 

    it('Should select first video track', () => {
      const media       = new Media({ metadata });
      const videoNeeded = metadata.streams[0];
      
      media.selectVideoTrack();
      
      assert.deepStrictEqual(media.best.video, videoNeeded);
    }); 
  });

  describe('#selectPresets', () => {
    const presets       = require('./resources/presets-video.json');
    const defaultPreset = presets.reduce((prec, cur) => {
      if (prec && prec.default) {
        return prec;
      }

      return (cur.default ? cur : null);
    });

    function selectAll(media, presets, defaultPreset) {
      media.selectBestAV(enLanguage)
           .selectVideoTrack()
           .selectPresets(presets, defaultPreset);
    }

    function cleanResult(result) {
      delete result.subtitle;
      delete result.audio.tracks;
      delete result.video.track;
      return result;
    }

    it('Should not be callable before selectVideoTrack and selectAudioAndSubTrack', () => {
      const media = new Media({});
      assert.throws(() => media.selectPresets());
    }); 

    it('Should fallback to default preset and preserve av bitrate and size', () => {
      const metadata = require('./resources/metadata-video-low.json');
      const media    = new Media({ metadata });

      selectAll(media, [], defaultPreset);

      assert.strictEqual(media.outputs.length, 1, 'It should not have more than one quality selected');
      
      assert.deepStrictEqual(
        cleanResult(media.outputs[0]), 
        _.merge({}, defaultPreset, {
          video: {
            width:   metadata.streams[0].width,
            height:  metadata.streams[0].height,
            bitrate: metadata.streams[0].bit_rate
          },
          audio: {
            bitrate: metadata.streams[1].bit_rate,
          }
        })
      );
    });

    it('Should select first preset, arrange width and use original audio bitrate', () => {
      const metadata       = require('./resources/metadata-video-480.json');
      const media          = new Media({ metadata });
      const expectedPreset = presets[0];
      
      selectAll(media, presets, defaultPreset);

      assert.strictEqual(media.outputs.length, 1, 'It should not have more than one quality selected');
      
      assert.deepStrictEqual(
        cleanResult(media.outputs[0]), 
        _.merge({}, expectedPreset, {
          video: {
            width: 640,
          },
          audio: {
            bitrate: metadata.streams[1].bit_rate,
          }
        })
      );
    });
  });
});