const media  = require('../src/media.js');
const Media  = media.Media;
const assert = require('assert');
const _      = require('lodash');
const path   = require('path');

describe('Media', () => {
  const enLanguage = /^(en|us).*/i;
  const frLanguage = /^fr.*/i;
  const ruLanguage = /^ru.*/i;
  const czLanguage = /^cz.*/i;
  const mediaFile1 = path.join(__dirname, 'resources/bbb-625-10.mp4');

  describe('#create', () => {
    it('Can\'t open media file', (done) => {
      media('notfound')
        .then(() => done(new Error('It should not found file')))
        .catch((err) => done());
    });

    it('Can prepare media file', (done) => {
      media(mediaFile1)
        .then(() => done())
        .catch((err) => done(err));
    });
  });

  describe('#findBestAS', () => {
    const metadata = require('./resources/metadata-audio-subtitles.json');

    it('Should not be able to found an audio track', () => {
      const media = new Media({});
      assert.throws(() => media.findBestAS(enLanguage));
    }); 

    it('Should select our preferred audio track and forced subtitles', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[1];
      const subtitleNeeded  = metadata.streams[5];
      const tracks          = media.findBestAS(enLanguage);
      
      assert.deepStrictEqual(tracks.audio, audioNeeded);
      assert.deepStrictEqual(tracks.subtitle, subtitleNeeded);
    });

    it('Should select first audio track and preferred subtitles', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[0];
      const subtitleNeeded  = metadata.streams[8];
      const tracks          = media.findBestAS(ruLanguage);

      assert.deepStrictEqual(tracks.audio, audioNeeded);
      assert.deepStrictEqual(tracks.subtitle, subtitleNeeded);
    });

    it('Should select first audio track and fallback to forced subtitles', () => {
      const metadataCpy     = _.merge({}, metadata);
      metadataCpy.streams.splice(8, 1);
      const media           = new Media({ metadata: metadataCpy });
      const audioNeeded     = metadataCpy.streams[0];
      const subtitleNeeded  = metadataCpy.streams[7];
      const tracks          = media.findBestAS(ruLanguage);

      assert.deepStrictEqual(tracks.audio, audioNeeded);
      assert.deepStrictEqual(tracks.subtitle, subtitleNeeded);
    });

    it('No preferred subtitle & audio tracks, fallback to first audio track', () => {
      const media           = new Media({ metadata });
      const audioNeeded     = metadata.streams[0];
      const tracks          = media.findBestAS(czLanguage);

      assert.deepStrictEqual(tracks.audio, audioNeeded);
    });
  });

  describe('#metadata setter', () => {
    const asMetadata = require('./resources/metadata-audio-subtitles.json');
    const vMetadata  = require('./resources/metadata-video-low.json');

    it('Should have subtitles and audio', () => {
      const media           = new Media({ metadata: asMetadata });
      const subtitlesNeeded = [ 
        asMetadata.streams[3], 
        asMetadata.streams[4], 
        asMetadata.streams[5],
        asMetadata.streams[6],
        asMetadata.streams[7],
        asMetadata.streams[8]
      ];
      const audioNeeded = [ 
        asMetadata.streams[0], 
        asMetadata.streams[1], 
        asMetadata.streams[2],
      ];

      assert.deepStrictEqual(media.tracks.subtitle, subtitlesNeeded);
      assert.deepStrictEqual(media.tracks.audio, audioNeeded);
    });

    it('Should have video and audio track', () => {
      const media           = new Media({ metadata: vMetadata });
      const videoNeeded     = [ vMetadata.streams[0] ];
      const audioNeeded     = [ vMetadata.streams[1] ];
      assert.deepStrictEqual(media.tracks.video, videoNeeded);
      assert.deepStrictEqual(media.tracks.audio, audioNeeded);
    });
  });


  describe('#findVideoTrack', () => {
    const metadata = require('./resources/metadata-video-low.json');

    it('Should not be able to found a video track', () => {
      const media = new Media({});
      assert.throws(() => media.findVideoTrack());
    }); 

    it('Should select first video track', () => {
      const media       = new Media({ metadata });
      const videoNeeded = metadata.streams[0];
      const videoTrack  = media.findVideoTrack();
      
      assert.deepStrictEqual(videoTrack, videoNeeded);
    }); 
  });

  describe('#configurePresets', () => {
    const presets       = require('./resources/presets-video.json');
    const defaultPreset = presets.reduce((prec, cur) => {
      if (prec && prec.default) {
        return prec;
      }

      return (cur.default ? cur : null);
    });

    function selectAll(media, presets, defaultPreset) {
      const asTracks = media.findBestAS(enLanguage);
      return media.configurePresets({ 
        audioTracl: asTracks.audio, 
        presets, 
        defaultPreset
      });
    }

    function cleanResult(result) {
      delete result.audio.tracks;
      delete result.video.track;
      return result;
    }

    it('Should fallback to default preset and preserve av bitrate and size', () => {
      const metadata = require('./resources/metadata-video-low.json');
      const media    = new Media({ metadata });
      const presets  = selectAll(media, [], defaultPreset);

      assert.strictEqual(presets.length, 1, 'It should not have more than one quality selected');
      
      assert.deepStrictEqual(
        cleanResult(presets[0]), 
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
      const returnPresets  = selectAll(media, presets, defaultPreset);

      assert.strictEqual(returnPresets.length, 1, 'It should not have more than one quality selected');
      
      assert.deepStrictEqual(
        cleanResult(returnPresets[0]), 
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