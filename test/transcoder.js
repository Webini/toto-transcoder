const Transcoder = require('../src/transcoder.js');
const assert     = require('assert');
const path       = require('path');

describe('Transcoder', () => {
  const outputDir  = path.join(__dirname, 'tmp');
  const filePrefix = 'test';
  const mediaFile1 = path.join(__dirname, 'resources/bbb-625-10.mp4');
  const presets    = require('./resources/presets-video.json');
  const transco    = new Transcoder({ presets });

  describe('#prepare', () => {
    it('Can\'t open subtitles', (done) => {
      transco
        .prepare(media1, 'notfound')
        .then(() => done(new Error('It should not found file')))
        .catch((err) => done());
    });

    it('Can\'t open media file', () => {
      transco
        .prepare('notfound')
        .then(() => done(new Error('It should not found file')))
        .catch((err) => done());
    });

    it('Can prepare media file', (done) => {
      transco
        .prepare(media1)
        .then(() => done())
        .then((err) => done(err));
    });

    it.only('Can make basic transcoding with progression', function(done) {
      let   progressSeen = false;
      this.timeout(15000);

      transco
        .prepare(mediaFile1)
        .then((media) => {
          return transco.transcode(media, outputDir, filePrefix, (progress) => {
            console.log('PROGRESS => ', progress);
            progressSeen = true;
          });
        })
        .then((result) => {
          console.log('RESULT !! => ', result);
          done();
        })
        .catch((err) => done(err));
    });
  });
});