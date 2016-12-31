const Transcoder = require('../src/transcoder.js');
const assert     = require('assert');
const path       = require('path');
const fs         = require('fs');

describe('Transcoder', () => {
  const outputDir  = path.join(__dirname, 'tmp');
  const filePrefix = 'test%';
  const mediaFile1 = path.join(__dirname, 'resources/bbb-625-10.mp4');
  const presets    = require('./resources/presets-video.json');
  const thumbnails = {
    delay: "1",
    width: 120,
    cols: 3
  };
  const subtitles = {
    codec: "webvtt",
    extension: "vtt"
  };
  const transco    = new Transcoder({ presets, thumbnails, subtitles });

  describe('#transcode', () => {
    it('Can immediatly kill a transcoding instance', function(done) {
      this.timeout(60000);
  
      transco
        .prepare(mediaFile1)
        .then((media) => {
          const transcoPromise = transco.transcode(media, outputDir, filePrefix);

          transcoPromise.kill();
          return transcoPromise;
        })
        .then((data) => {
          done(new Error('Transcoding finished'));
        })
        .catch((err) => done());
    });

    it('Can kill a transcoding instance after run', function(done) {
      this.timeout(60000);
  
      transco
        .prepare(mediaFile1)
        .then((media) => {
          const transcoPromise = transco.transcode(media, outputDir, filePrefix);

          setTimeout(() => {
            transcoPromise.kill();
          }, 200);

          return transcoPromise;
        })
        .then((data) => {
          done(new Error('Transcoding finished'));
        })
        .catch((err) => done());
    });

    it('Can make basic transcoding with progression', function(done) {
      this.timeout(60000);
      let progressSeen = false;
      let expectedFilePrefix = filePrefix;

      const expectedResult = {
        transcoded: {
          '480p': {
            duration: 9.466667,
            resolution: { width: 854, height: 480 }
          },
          '720p': {
            duration: 9.466667,
            resolution: { width: 1280, height: 720 }
          },
          '1080p': {
            duration: 9.466667,
            resolution: { width: 1920, height: 1080 }
          }
        },
        thumbnails: {
          file: path.join(outputDir, `${expectedFilePrefix}.thumbs.jpg`),
          meta: {
            cols: thumbnails.cols,
            delay: thumbnails.delay,
            quantity: 12,
            size: {
              height: 68,
              width: thumbnails.width
            }
          },
          size: 36633
        },
        subtitles: [
          {
            default: false,
            file: path.join(outputDir, `${expectedFilePrefix}.0.vtt`),
            forced: false,
            label: "No Name",
            lang: null,
            lang_639_1: null,
            lang_639_2: null,
            size: 328
          },
          {
            default: false,
            file: path.join(outputDir, `${expectedFilePrefix}.1.vtt`),
            forced: false,
            label: "No Name",
            lang: null,
            lang_639_1: null,
            lang_639_2: null,
            size: 368
          }
        ]
      };

      presets.forEach((preset) => {
        expectedResult.transcoded[preset.name].file = path.join(outputDir, `${expectedFilePrefix}.${preset.name}.${preset.format}`);
      });
    
      after(() => {
        for (var key in expectedResult.transcoded) {
          fs.unlinkSync(expectedResult.transcoded[key].file);
        }

        expectedResult.subtitles.forEach((subtitle) => {
          fs.unlinkSync(subtitle.file);
        });
        
        fs.unlinkSync(expectedResult.thumbnails.file);
      });

      transco
        .prepare(mediaFile1)
        .then((media) => {
          return transco.transcode(media, outputDir, filePrefix, (progress) => {
            progressSeen = true;
          });
        })
        .then((result) => {
          if (!progressSeen) {
            throw new Error('Progression error');
          } else {
            presets.forEach((preset) => {
              expectedResult.transcoded[preset.name].size = result.transcoded[preset.name].size;
            });

            assert.deepStrictEqual(result, expectedResult);
            done();
          }
        })
        .catch((err) => done(err));
    });
  });
});