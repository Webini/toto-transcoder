const EventEmitter = require('events');
const FFmpeg       = require('fluent-ffmpeg');
const assert       = require('assert');
const mkdir        = require('mkdirp');
const path         = require('path');
const fs           = require('fs');
const map_639      = require('./iso-639-2.json');
const media        = require('./media.js');
const statFile     = require('./utils/statFile.js');
const Thumbnails   = require('./thumbnails.js');
const rimraf       = require('rimraf');

const SCALE_FILTER = 'scale';
const FPS_FILTER   = 'fps';

/**
 * @param {Object} items configuredPresets
 * @return {Number}
 */
function findMaxFrames(items) {
  let maxFrames = 0;
  for (const [key, value] of Object.entries(items)) {
    let tracks = null;

    if (value.track) {
      tracks = [ value.track ];
    } else if (value.tracks) {
      tracks = value.tracks;
    } else {
      continue;
    }

    tracks.forEach((track) => {
      if (track.nb_frames !== 'N/A' && track.nb_frames > maxFrames) {
        maxFrames = parseInt(track.nb_frames);
      }
    });
  }
  return maxFrames;
}

/**
 * @param {String} file File path
 * @param {Function|null} progressCallback Progression Callback
 * @param {Boolean} debug 
 * @return {FFmpeg} FFmpeg object 
 */
function prepareFFmpegObject(file, progressCallback, debug) {
  const ffo = FFmpeg(file);

  const killFFmpeg = function() {
    ffo.kill();
  };

  const removeListener = function() {
    process.removeListener('exit', killFFmpeg);
  };

  process.on('exit', killFFmpeg);

  if (progressCallback) {
    ffo.on('progress', progressCallback);
  }
  
  ffo.on('start', (commandLine) => {
    if (debug) {
      console.log('Spawned Ffmpeg with command: ' + commandLine);
    }
    
    if (ffo.killed) {
      ffo.kill('SIGKILL');
    }
  });

  ffo.on('end', removeListener);
  ffo.on('error', removeListener);

  return ffo;
}

/**
 * @param {Number} bits
 * @returns {Integer}
 */
function toKb(bits) {
  return parseInt(bits / 1024).toString() + 'k';
}

class Transcoder {
  static get EVENT_START()    { return 'start' }
  static get EVENT_PROGRESS() { return 'progress' }
  static get EVENT_FAILED()   { return 'failed' }
  static get EVENT_FINISHED() { return 'finished' }

  /** 
   * @param {Object} [param]
   * @param {Boolean} [param.debug=false] debug  
   * @param {Object} [param.emitter=EventEmitter] Custom event emitter or fallback to node event emitter
   * @param {Object} param.conf
   * @param {integer} [param.conf.maxInstances=null] Max transcoder instances that can run simultaneously, if not set there is not limits
   * @param {Object} param.conf.encoders Object containing { codecName: encoderName, ... }, must be set, if an encoders is not found for preset the transcoder will not transcode
   * @param {Object} [param.conf.filters=null] Object containing { filterName: newFilterName } if this object is not set all filters are accepted, if this object is defined you must define all filters else it will not transcode media
   * @param {String[]} [param.conf.codecBlacklist=[]] Array of blacklisted codec, it will not process the tracks associated with this codec
   * @param {Object} [param.conf.decoders=null] Object containing { video, audio, subtitle }
   * @param {Object} [params.conf.decoders.video=null] Object containing { codecName: decoderName }, if this parameter is not set, the transcoder will accept all codecs else if the decoders is not found the transcoder will not process this media
   * @param {Object} [params.conf.decoders.audio=null] Object containing { codecName: decoderName }, if this parameter is not set, the transcoder will accept all codecs else if the decoders is not found the transcoder will not process this media
   * @param {Object} [params.conf.decoders.subtitle=null] Object containing { codecName: decoderName }, if this parameter is not set, the transcoder will accept all codecs else if the decoders is not found the transcoder will not process this media
   * @param {String} [params.conf.hwDecoder=null] Hardware decoder name
   */
  constructor({ emitter, conf } = { emitter: null }) {
    this.emitter = emitter || new EventEmitter;
    this.conf = Object.assign({
      hwDecoder: null,
      maxInstances: null,
      decoders: null,
      codecBlacklist: [],
      filters: null
    }, conf);

    this.conf.codecBlacklist = this.conf.codecBlacklist.map((item) => {
      return item.toLowerCase();
    });

    assert.ok(this.conf.encoders instanceof Object, 'Encoders field is invalid, must be an object and defined');
  }

  /**
   * If we can encode this codec
   * 
   * @param {String} codecName
   * @returns {Boolean}
   * 
   * @memberOf Transcoder
   */
  canEncode(codecName) {
    return (this.getEncoder(codecName) !== undefined);
  }

  /**
   * Get encoder for a given codecName
   * 
   * @param {String} codecName
   * @returns {(String|undefined)} undefined if not found
   * 
   * @memberOf Transcoder
   */
  getEncoder(codecName) {
    return this.conf.encoders[codecName];
  }

  /**
   * Get decoder for codecName
   * If no decoders are defined (we will not select decoders in ffmpeg), this method return null
   * If decoders are defined it will return undefined if not found or the decoderName
   * 
   * @param {String} codecName
   * @param {String} codecType video,audio,subtitle
   * @returns {(null|undefined|String)}
   * 
   * @memberOf Transcoder
   */
  getDecoder(codecName, codecType) {
    if (!this.conf.decoders || !this.conf.decoders[codecType]) {
      return null;
    }
    return this.conf.decoders[codecType][codecName];
  }

  /**
   * Get filter alias
   * 
   * @param {String} filterName
   * @returns {String}
   * 
   * @memberOf Transcoder
   */
  getFilter(filterName) {
    if (!this.conf.filters) {
      return filterName;
    }

    return this.conf.filters[filterName];
  }

  /**
   * Check if the transcoder can use the filter filterName
   * 
   * @param {String} filterName
   * @returns {Boolean}
   * 
   * @memberOf Transcoder
   */
  canFilter(filterName) {
    if (!this.conf.filters) {
      return true;
    }

    return (this.conf.filters[filterName] !== undefined);
  }

  /**
   * If transcoder can decode codecName
   * 
   * @param {String} codecName
   * @param {String} codecType
   * @returns {Boolean}
   * 
   * @memberOf Transcoder
   */
  canDecode(codecName, codecType) {
    if (!this.conf.decoders || !this.conf.decoders[codecType]) {
      return true;
    }

    return (this.conf.decoders[codecType][codecName] !== undefined);
  }

  /**
   * Check if a codec is blacklisted
   * 
   * @param {String} codecName
   * @returns {Boolean}
   * 
   * @memberOf Transcoder
   */
  isCodecBlacklisted(codecName) {
    return this.conf.codecBlacklist.includes(codecName.toLowerCase());
  }

  /**
   * Check if transcoder can process this preset
   * The preset must be configured with media.configurePresets 
   * 
   * @param {Object} preset
   * @returns {Boolean}
   * 
   * @memberOf Transcoder
   */
  canProcess(configuredPreset) {
    for (const [key, value] of Object.entries(configuredPreset)) {
      if (value.encoder) {
        if (!this.canEncode(value.encoder)) {
          return false;
        }
      }

      if (key === 'video' && !this.canFilter(SCALE_FILTER) ||
          key === 'thumbnails' && !this.canFilter(FPS_FILTER)) {
        return false;
      }

      let tracks = null;
      if (value.track) {
        tracks = [ value.track ];
      } else if (value.tracks) {
        tracks = value.tracks;
      }

      const canDecode = (!tracks ? true : tracks.reduce((prev, current) => {
        if (!prev || current && !this.canDecode(current.codec_name, current.codec_type)) {
          return false;
        }
        return true;
      }, true));
      
      if (!canDecode) {
        return false;
      }
    }
    return true;
  }

  _processAV(ffo, filePrefix, outputDirectory, preset) {
    if (!preset.video && !preset.audio || !preset.format || !preset.extension) {
      return null;
    }

    const file     = path.join(outputDirectory, `${filePrefix}.${preset.name}${preset.extension ? '.' + preset.extension : ''}`);
    const output   = ffo.output(file);
    const returned = { file };
    const options  = [];

    //remove existing file
    try { fs.unlinkSync(outFile); } catch(e) { }
    
    if (this.conf.debug) { 
      options.push('-t 30'); 
    }

    if (preset.video && preset.video.track && 
         !this.isCodecBlacklisted(preset.video.track.codec_name)) {
      ffo.complexFilter([
        `[0:${preset.video.track.index}]` +
        this.getFilter(SCALE_FILTER) + 
        `=${preset.video.width}:${preset.video.height}` +
        `[vout]`
      ]);

      if(preset.video.preset){
        options.push('-preset ' + preset.video.preset);
      }

      options.push(
        '-maxrate ' + toKb(preset.video.maxbitrate),
        '-bufsize ' + toKb(preset.video.maxbitrate * 4),
        '-map [vout]'
      );

      const decoder = this.getDecoder(preset.video.track.codec_name);
      if (decoder === undefined) {
        throw new Error(`Cannot found decoder for ${preset.video.track.codec_name}`);
      } else if (decoder !== null) {
        ffo.addInputOption(`-c:v ${decoder}`);

        if (this.conf.hwDecoder) {
          ffo.addInputOption(`-hwaccel ${this.conf.hwDecoder}`);
        }
      }

      output.videoCodec(this.getEncoder(preset.video.encoder))
            .videoBitrate(preset.video.bitrate);

      if (preset.video.track.duration !== 'N/A') {
        returned['duration'] = preset.video.track.duration;
      }

      returned['resolution'] = {
        width: preset.video.width,
        height: preset.video.height
      };
    }

    if (preset.audio) {
      preset.audio.tracks.forEach((track) => {
        if (!this.isCodecBlacklisted(track.codec_name)) {
          options.push(`-map 0:${track.index}`);
        }
      });

      output.audioBitrate(toKb(preset.audio.bitrate))
            .audioChannels(preset.audio.channels)
            .audioCodec(this.getEncoder(preset.audio.encoder));
    }

    if (preset.subtitle && !preset.subtitle.format && !preset.subtitle.extension) {
      options.push(`-scodec ${this.getEncoder(preset.subtitle.encoder)}`);

      preset.subtitle.tracks.forEach((track) => {
        if (!this.isCodecBlacklisted(track.codec_name)) {
          options.push(`-map 0:${track.index}`);
        }
      });
    }

    output.outputOptions(options)
          .format(preset.format);

    return returned;
  }

  /**
   * Finalize AV transcoding
   * @param {String} videoData result of _processAV
   * @return {Promise}
   */
  _finalizeAV(videoData) {
    if (videoData && !videoData.duration) {
      return media(videoData.file)
        .then((media) => {
          const video = media.findVideoTrack();
          if (video) {
            videoData.duration = video.duration;
          }

          return videoData;
        })
        //@todo add log infos, this should never happend inshallah
        .catch((err) => videoData);
    }

    return Promise.resolve(videoData);
  }

  _processSub(ffo, filePrefix, outputDirectory, preset) {
    if (!preset.subtitle || !preset.subtitle.tracks || !preset.subtitle.format || 
        !preset.subtitle.extension || preset.subtitle.tracks.length <= 0) {
      return null;
    }

    return preset.subtitle.tracks.map((track) => {
      if (!this.isCodecBlacklisted(track.codec_name)) {
        const file    = path.join(outputDirectory, `${filePrefix}.${track.index}.${preset.subtitle.extension}`);
        const output  = ffo.output(file);
        const options = [];

        if (this.conf.debug) { 
          options.push('-t 30'); 
        }

        options.push(
          `-scodec ${this.getEncoder(preset.subtitle.encoder)}`,
          `-map 0:${track.index}`,
          `-an`,
          `-vn`
        );

        output.outputOptions(options)
              .format(preset.subtitle.format);

        const code_639_2 = (track.tags && track.tags.language !== 'und' ? track.tags.language : null);
        const language   = (code_639_2 ? map_639[code_639_2].label : null);
        return {
          label: (track.tags ? track.tags.title : null) || language || 'No Name',
          lang_639_2: code_639_2,
          lang_639_1: (code_639_2 ? map_639[code_639_2].code : null),
          lang: language,
          default: track.disposition.default ? true : false,
          forced: track.disposition.forced ? true : false,
          file: file
        }; 
      }
    });
  }

  /**
   * Finalize subtitles
   * 
   * @param {Object} subData result of processSub
   * @returns {Promise}
   * 
   * @memberOf Transcoder
   */
  _finalizeSub(subData) {
    return Promise.resolve(subData.map((sub) => {
      sub.size = statFile(sub.file);
      return sub;
    }));
  }

  _processThumb(ffo, outputDirectory, hasVideo, preset) {
    if (!preset.thumbnails || !preset.thumbnails.format || !preset.thumbnails.extension) {
      return null;
    }

    if (hasVideo) {
      throw new Error('Cannot process thumbnails with transcoding video track');
    }

    const directory = path.join(outputDirectory, 'thumbs');
    const file      = path.join(directory.replace(/%/g, '%%'), `snap.%03d.${preset.thumbnails.extension}`);
    const output    = ffo.output(file);
    const options   = [];

    mkdir.sync(directory);

    if (this.conf.debug) { 
      options.push('-t 30'); 
    }
    
    output.complexFilter([
      `[0:${preset.thumbnails.track.index}]` + 
      this.getFilter(FPS_FILTER) +
      `=${preset.thumbnails.delay},` +
      this.getFilter(SCALE_FILTER) +
      `=${preset.thumbnails.width || -1}:${preset.thumbnails.height || -1}` + 
      '[thumbs]'
    ]);

    options.push('-map [thumbs]');

    output.outputOptions(options)
          .format(preset.thumbnails.format);

    return { directory };
  }

  /**
   * @param {Object} thumbsConf
   * @param {Object} thumbData
   * @param {String} outputDirectory
   * @param {String} filePrefix
   * @returns
   * 
   * @memberOf Transcoder
   */
  _finalizeThumb(thumbsConf, thumbData, outputDirectory, filePrefix) {
    if (!thumbsConf || !thumbData) {
      return Promise.resolve(null);
    }
    
    const finalFile = path.join(outputDirectory, `${filePrefix}.thumbs.jpg`);
    const thumbs = new Thumbnails(thumbData.directory, thumbsConf.columns);
    
    return thumbs
      .combine(finalFile)
      .then((data) => {
        data.delay = thumbsConf.delay;
        return data;
      });
  }

  /**
   * Transcode file
   * 
   * @param {String} file
   * @param {String} output
   * @param {String} filePrefix
   * @param {Object} preset
   * @param {Object} [transitData] data transitted with the events and promise
   * @returns {Promise}
   * 
   * @memberOf Transcoder
   */
  transcode(file, outputDirectory, filePrefix, preset, transitData) {
    const totalFrames = findMaxFrames(preset);
    const baseOutput = {
      name: preset.name,
      file: file,
      data: transitData
    };

    const ffo = prepareFFmpegObject(
      file, 
      (evt) => { 
        evt.totalFrames = totalFrames;
        evt.eta         = (evt.totalFrames - evt.frames) / (evt.currentFps || 1);

        this.emitter.emit(this.EVENT_PROGRESS, Object.assign({
          state: evt
        }, baseOutput));
      },
      this.conf.debug
    );

    const promise = new Promise((resolve, reject) => {
      mkdir.sync(outputDirectory);

      const videoResult = this._processAV(ffo, filePrefix, outputDirectory, preset);
      const subResult   = this._processSub(ffo, filePrefix, outputDirectory, preset);
      const thumbResult = this._processThumb(ffo, outputDirectory, (videoResult !== null), preset);

      ffo.on('error', (error, stdout, stderr) => {
        if (ffo.killed) {
          reject(new Error('FFmpeg killed'));
        } else {
          reject(stderr || error || stdout);
        }
      });

      ffo.on('end', () => {
        const promises = [];
        const result   = Object.assign({}, baseOutput);
        
        if (videoResult) {
          promises.push(
            this._finalizeAV(videoResult)
                .then((data) => {
                  result.transcoded = data;
                })
          );
        }

        if (subResult) {
          promises.push(
            this._finalizeSub(subResult)
                .then((data) => {
                  result.subtitles = data;
                })
          );
        }

        if (thumbResult) {
          promises.push(
            this._finalizeThumb(preset.thumbnails, thumbResult, outputDirectory, filePrefix)
                .then((data) => {
                  try { rimraf.sync(thumbResult.directory) } catch(e) { }
                  result.thumbnails = data;
                })
          );
        }

        Promise
          .all(promises)
          .then(() => {
            this.emitter.emit(this.EVENT_FINISHED, Object.assign({
              result: result
            }, baseOutput));
            resolve(result);
          })
          .catch((err) => {
            this.emitter.emit(this.EVENT_FAILED, Object.assign({
              error: err
            }, baseOutput));
            reject(err)
          });
      });

      this.emitter.emit(this.EVENT_START, baseOutput);
      ffo.run();
    });

    promise.kill = function(){
      ffo.killed = true;
      ffo.kill('SIGKILL');
    };  

    return promise;
  }
}

module.exports = Transcoder;