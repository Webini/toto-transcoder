const Media  = require('../src/media.js');
const assert = require('assert');
const _      = require('lodash');

describe('Media', () => {
  const enLanguage = /^(en|us).*/i;
  const frLanguage = /^fr.*/i;
  const ruLanguage = /^ru.*/i;
  const czLanguage = /^cz.*/i;

  describe('#selectAudioAndSubTrack', () => {
    const metadata = require('./resources/metadata-audio-subtitles.json');

    it('Should not be able to found an audio track', () => {
      const media = new Media({});
      assert.throws(() => media.selectPresets(enLanguage));
    }); 

    it('Should select our preferred audio track and forced subtitles', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[1];
      const subtitleNeeded  = metadata.streams[5];

      media.selectAudioAndSubTrack(enLanguage);

      assert.deepStrictEqual(media.map.audio, audioNeeded);
      assert.deepStrictEqual(media.map.subtitle, subtitleNeeded);
    });

    it('Should select first audio track and preferred subtitles', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[0];
      const subtitleNeeded  = metadata.streams[8];

      media.selectAudioAndSubTrack(ruLanguage);

      assert.deepStrictEqual(media.map.audio, audioNeeded);
      assert.deepStrictEqual(media.map.subtitle, subtitleNeeded);
    });

    it('Should select first audio track and fallback to forced subtitles', () => {
      const metadataCpy     = _.clone(metadata, true);
      metadataCpy.streams.splice(8, 1);
      const media           = new Media({ metadata: metadataCpy });
      const audioNeeded     = metadataCpy.streams[0];
      const subtitleNeeded  = metadataCpy.streams[7];
      
      media.selectAudioAndSubTrack(ruLanguage);

      assert.deepStrictEqual(media.map.audio, audioNeeded);
      assert.deepStrictEqual(media.map.subtitle, subtitleNeeded);
    });

    it('No preferred subtitle & audio tracks, fallback to first audio track', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[0];

      media.selectAudioAndSubTrack(czLanguage);

      assert.deepStrictEqual(media.map.audio, audioNeeded);
    });
  });


  describe('#selectVideoTrack', () => {
    const metadata = require('./resources/metadata-video.json');

    it('Should not be able to found a video track', () => {
      const media = new Media({});
      assert.throws(() => media.selectVideoTrack());
    }); 

    it('Should select first video track', () => {
      const media       = new Media({ metadata });
      const videoNeeded = metadata.streams[0];
      
      media.selectVideoTrack();
      
      assert.deepStrictEqual(media.map.video, videoNeeded);
    }); 
  });

  describe('#selectPresets', () => {
    const metadata      = require('./resources/metadata-video.json');
    const presets       = require('./resources/presets-video.json');
    const defaultPreset = presets.reduce((prec, cur) => {
      if (prec && prec.default) {
        return prec;
      }

      return (cur.default ? cur : null);
    });

    function selectAll(media, presets, defaultPreset) {
      media.selectAudioAndSubTrack(enLanguage)
           .selectVideoTrack()
           .selectPresets(presets, defaultPreset);
    }

    it('Should not be callable before selectVideoTrack and selectAudioAndSubTrack', () => {
      const media = new Media({});
      assert.throws(() => media.selectPresets());
    }); 

    it('Should fallback to default preset', () => {
      const media = new Media({ metadata });

      selectAll(media, {}, defaultPreset);
      
    });
  });
});