const Transcoder = require('../src/transcoder.js');
const assert     = require('assert');
const path       = require('path');
const fs         = require('fs');

describe('Transcoder', () => {
  const outputDir  = path.join(__dirname, 'tmp');
  const filePrefix = 'test';
  const mediaFile1 = path.join(__dirname, 'resources/bbb-625-10.mp4');
  const presets    = require('./resources/presets-video.json');
  const thumbnails = {
    delay: "1",
    width: "120",
    cols: 3
  };
  const subtitles = {
    codec: "webvtt",
    extension: "vtt"
  };
  const transco    = new Transcoder({ presets, thumbnails, subtitles });

  describe('#prepare', () => {
    it('Can\'t open subtitles', (done) => {
      transco
        .prepare(mediaFile1, 'notfound')
        .then(() => done(new Error('It should not found file')))
        .catch((err) => done());
    });

    it('Can\'t open media file', (done) => {
      transco
        .prepare('notfound')
        .then(() => done(new Error('It should not found file')))
        .catch((err) => done());
    });

    it('Can prepare media file', (done) => {
      transco
        .prepare(mediaFile1)
        .then(() => done())
        .catch((err) => done(err));
    });

    it('Can make basic transcoding with progression', function(done) {
      let progressSeen = false;
      const expectedResult = {
        transcoded: {},
        thumbnails: {
          file: path.join(outputDir, `${filePrefix}.thumbs.jpg`),
          meta: {
            cols: thumbnails.cols,
            delay: thumbnails.delay,
            quantity: 12,
            size: {
              height: 68,
              width: 120
            }
          }
        }
      };
      this.timeout(60000);

      presets.forEach((preset) => {
        expectedResult.transcoded[preset.name] = path.join(outputDir, `${filePrefix}.${preset.name}.${preset.format}`);
      });
    
      after(() => {
        try {
          for (var key in expectedResult.transcoded) {
            fs.unlinkSync(expectedResult.transcoded[key]);
          }
          fs.unlinkSync(expectedResult.thumbnails.file);
        } catch(e) {}
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
            console.log(result);
            assert.deepStrictEqual(result, expectedResult);
            done();
          }
        })
        .catch((err) => done(err));
    });

    it.only('Can exctract subtitles', function(done) {
      this.timeout(5555000);

      transco
        .prepare(@todo)
        .then((media) => {
          return transco.extractSubtitles(media, outputDir, 'subtitle');
        })
        .then(() => done())
        .catch((err) => done(err));
    });
  });
});