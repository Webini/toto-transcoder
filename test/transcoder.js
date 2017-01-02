const Transcoder = require('../src/transcoder.js');
const assert     = require('assert');
const path       = require('path');
const fs         = require('fs');
const media      = require('../src/media');
const Media      = media.Media;

describe('Transcoder', () => {
  const globalConf = require('./resources/manager.json');
  const cpuConf = globalConf.transcoders.cpu;
  const gpuConf = globalConf.transcoders.nvidia;
  const gpuTransco = new Transcoder({ conf: gpuConf });
  const cpuTransco = new Transcoder({ conf: cpuConf });

  describe('#getEncoder', () => {
    it('Should return encoder name', () => {
      assert.strictEqual(cpuTransco.getEncoder('h264'), 'libx264');
    });

    it('Should return undefined', () => {
      assert.strictEqual(cpuTransco.getEncoder('hevc'), undefined);
    });
  });

  describe('#canEncode', () => {
    it('Should be ok', () => {
      assert.strictEqual(cpuTransco.canEncode('h264'), true);
    }); 
    it('Should not be ok', () => {
      assert.strictEqual(cpuTransco.canEncode('unexistant'), false);
    }); 
  });

  describe('#getDecoder', () => {
    it('Should return decoder name', () => {
      assert.strictEqual(gpuTransco.getDecoder('h264', 'video'), 'h264_cuvid');
    });

    it('Should return undefined', () => {
      assert.strictEqual(gpuTransco.getDecoder('unexistant', 'video'), undefined);
    });

    it('Should return null', () => {
      assert.strictEqual(cpuTransco.getDecoder('h264', 'unexistant'), null);
    });
  });

  describe('#canDecode', () => {
    it('Should be ok', () => {
      assert.strictEqual(cpuTransco.canDecode('unexistant', 'unexistant'), true);
    }); 

    it('Should be ok with decoder defined', () => {
      assert.strictEqual(gpuTransco.canDecode('h264', 'video'), true);
    }); 

    it('Should not be ok', () => {
      assert.strictEqual(gpuTransco.canDecode('unexistant', 'video'), false);
    }); 
  });

  describe('#isCodecBlacklisted', () => {
    it('Should be ok', () => {
      assert.strictEqual(cpuTransco.isCodecBlacklisted('dvd_subtitle'), true);
    }); 
    it('Should not be ok', () => {
      assert.strictEqual(cpuTransco.isCodecBlacklisted('unexistant'), false);
    }); 
  });

  describe('#getFilter', () => {
    it('Should find filter', () => {
      assert.strictEqual(cpuTransco.getFilter('unexistant'), 'unexistant');
    });

    it('Should not find filter', () => {
      assert.strictEqual(gpuTransco.getFilter('unexistant'), undefined);
    });

    it('Should find new filter name', () => {
      assert.strictEqual(gpuTransco.getFilter('scale'), 'scale_npp');
    });
  });

  describe('#canFilter', () => {
    it('Should be ok', () => {
      assert.strictEqual(cpuTransco.canFilter('unexistant'), true);
    })

    it('Should not be ok', () => {
      assert.strictEqual(gpuTransco.canFilter('unexistant'), false);
    });

    it('Should be ok with new filter name', () => {
      assert.strictEqual(gpuTransco.canFilter('scale'), true);
    });
  });

  describe('#canProcess', () => {
    const movie = new Media({ metadata: require('./resources/metadata-video-480.json') });
    const presets = movie.configurePresets({ presets: globalConf.presets });

    it('Should be ok', () => {
      //we can process this audio & video file with the preset n°0 and gpu
      assert.strictEqual(gpuTransco.canProcess(presets[0]), true);
      //and we can process thumbnails with cpu
      assert.strictEqual(cpuTransco.canProcess(presets[1]), true);
    });

    it('Should not be ok', () => {
      //but we can't process thumbnails with gpu
      assert.strictEqual(gpuTransco.canProcess(presets[1]), false);
    })
  });

  describe('#transcode', (done) => {
    const mediaFile = path.join(__dirname, 'resources/bbb-625-10.mp4');
    const outputDir  = path.join(__dirname, 'tmp');
    let movie   = null;
    let presets = null;

    before(() => {
      return media(mediaFile)
        .then((mData) => {
          movie   = mData;
          presets = mData.configurePresets({ presets: globalConf.presets });
        });
    });

    it('should transcode AV and incrust subs', function(done){
      this.timeout(30000);
      cpuTransco.transcode(mediaFile, outputDir, 'test', presets[0], { id: 52 })
        .then((data) => {
          assert.ok(data.transcoded && data.transcoded.duration > 9 && data.transcoded.duration < 11);
          assert.strictEqual(data.transcoded.resolution.width, 854);
          assert.strictEqual(data.transcoded.resolution.height, 480);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should export thumbnails and subs', function(done){
      this.timeout(30000);
      cpuTransco.transcode(mediaFile, outputDir, 'test', presets[3], { id: 52 })
        .then((data) => {
          assert.ok(data.thumbnails && data.subtitles);
          assert.strictEqual(data.subtitles.length, 2);
          assert.strictEqual(data.thumbnails.quantity, 2);
          done();
        })
        .catch(done);
    });

    after(() => {
      var files = fs.readdirSync(outputDir); 
      if(!files || files.length <= 0) {
        return;
      }

      files.forEach((file) => {
        if (file !== '.gitkeep') {
          fs.unlinkSync(path.join(outputDir, file));
        }
      });
    });
  });
});