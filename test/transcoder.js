const Transcoder = require('../src/transcoder.js');
const assert     = require('assert');
const path       = require('path');
const fs         = require('fs');

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
      assert.strictEqual(gpuTransco.getDecoder('h264'), 'h264_cuvid');
    });

    it('Should return undefined', () => {
      assert.strictEqual(gpuTransco.getDecoder('unexistant'), undefined);
    });

    it('Should return null', () => {
      assert.strictEqual(cpuTransco.getDecoder('h264'), null);
    });
  });

  describe('#canDecode', () => {
    it('Should be ok', () => {
      assert.strictEqual(cpuTransco.canDecode('unexistant'), true);
    }); 

    it('Should be ok with decoder defined', () => {
      assert.strictEqual(gpuTransco.canDecode('h264'), true);
    }); 

    it('Should not be ok', () => {
      assert.strictEqual(gpuTransco.canDecode('unexistant'), false);
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
});