const Media  = require('./media.js');
const FFmpeg = require('fluent-ffmpeg');
const fs     = require('fs');
const path   = require('path');
/*
const requiredConfKeys = [
  "name", 
  "vcodec", 
  "vbitrate", 
  "maxbitrate", 
  "acodec", 
  "abitrate", 
  "channel", 
  "width", 
  "height", 
  "format"
];*/

/**
 * @param {Object} preset
 
function assertPreset(preset) {
  const presetKeys = Object.keys(preset);

  requiredConfKeys.forEach((key) => {
    if (!presetKeys.contains(key)) {
      throw new Error(`The configuration element ${key} is missing for preset ${preset.name}`);
    }
  });
}
*/
/**
 * @param {String} file File path
 * @param {Function|null} progressCallback Progression Callback
 * @return {FFmpeg} FFmpeg object 
 */
function prepareFFmpegObject(file, progressCallback) {
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
    console.log('Spawned Ffmpeg with command: ' + commandLine);
  });

  ffo.on('end', removeListener);
  ffo.on('error', removeListener);

  return ffo;
}

class Transcoder {
  constructor({ presets, debug, preferredLang = '^fr.*' }) {
    this.preferredLang = new RegExp(preferredLang, 'i');
    this.debug         = debug || (process.env.NODE_DEBUG || '').toLowerCase().split(' ').includes('toto-transcoder'); 
    this.presets       = presets;
    this.defaultPreset = null;

    this.presets.forEach((preset) => {
      if (preset.default) {
        this.defaultPreset = preset;
      }
      //assertPreset(preset);
    });

    if (this.defaultPreset === null) {
      throw new Error('Cannot found default preset');
    }
  };

  /**
   * Create the media object for the transcoding
   * @param {String} inputFile
   * @param {String|undefined|null} subtitleFile
   * @param {Array} preset Name of the presets used for the transco 
   * @return {Promise}
   */
  prepare(inputFile, subtitleFile) {
    return new Promise((resolve, reject) => {
      const media = new Media({ file: inputFile, subtitle: subtitleFile });

      if (media.customSubtitle) {
        fs.accessSync(media.customSubtitle);
      }

      FFmpeg.ffprobe(media.file, (err, metadata) => {
        if(err){
          return reject(err);
        }
        
        media.metadata = metadata;
        
        resolve(
          media.selectBestAV(this.preferredLang)
               .selectVideoTrack(this.presets, this.defaultPreset)
               .selectPresets(this.presets, this.defaultPreset)
        );
      });
    });
  }


  /**
   * Transcode file
   * @param {Media} Media object 
   * @param {String} outputDirectory output directory for the transcoded files
   * @param {String} filePrefix filename, then we will concat quality name & container extension
   * @param {Function|null} progressCallback
   * @return {Promise} 
   */
  transcode(media, outputDirectory, filePrefix, progressCallback) {
    return new Promise((resolve, reject) => {
      const ffo     = prepareFFmpegObject(media.file, progressCallback);
      const files   = {};
      const filters = [];

      media
        .outputs
        .sort((first, second) => { //we need to desc order for complex filters 
          return (second.vbitrate + second.abitrate) - (first.vbitrate + first.abitrate);
        })
        .forEach((conf, i, outputs) => {
          const file           = path.join(outputDirectory, `${filePrefix}.${conf.name}.${conf.format}`);
          const output         = ffo.output(file);
          const options        = [];
          const filterOutName  = conf.name;
          const prevFilterName = (i > 0 ? outputs[i-1].name : null);

          files[conf.name] = file;

          //trying to remove file if exists
          try {
              fs.unlinkSync(outFile);
          } catch(e) { }

          filters.push(
            `[${(!prevFilterName ? ('0:' + conf.video.track.index) : prevFilterName)}]` +
            `scale=${conf.video.width}:${conf.video.height},` + 
            'split=' + (i + 1 < outputs.length ? `2[${filterOutName}]` : '1') + `[${filterOutName}tofile]`
          );
          
            options.push('-t 30');

          options.push(
            '-maxrate ' + conf.video.maxbitrate,
            '-bufsize ' + (conf.video.maxbitrate * 4)
          );

          if (conf.threads) {
            options.push('-threads ' + conf.threads);
          }

          if(conf.preset){
            options.push('-preset ' + conf.preset);
          }

          //on va mapper l'audio
          conf.audio.tracks.forEach((track) => {
            options.push(`-map 0:${track.index}`);
            if (track.index === media.best.audio.index) {
              options.push(`-disposition:0:${track.index} default`);
            }
          });

          //subtitles
          options.push('-scodec mov_text');
          
          conf.subtitle.tracks.forEach((track) => {
            if (track.codec_name.toLowerCase() !== 'dvdsub') {
              options.push(`-map 0:${track.index}`);

              if (track.index === media.best.subtitle.index) {
                options.push(`-disposition:0:${track.index} default`);
              }
            }
          });
          /**
           * @todo incrust subtitles 
           */

          options.push(`-map [${filterOutName}tofile]`);
          //options.push('-map 0:' + conf.video.track.index);
          
          output.audioCodec(conf.audio.codec)
                .audioBitrate(conf.audio.bitrate)
                .audioChannels(conf.audio.channels)
                .videoCodec(conf.video.codec)
                .videoBitrate(conf.video.bitrate)
                .outputOptions(options)
                .format(conf.format);
        });

      ffo.complexFilter(filters);

      ffo.on('error', (error, stdout, stderr) => {
        console.log('ERROR CATCHED', error);
        reject(stderr || error || stdout);
      });

      ffo.on('end', () => {
        resolve(files);
      });

      ffo.run();
    });
  }
};

module.exports = Transcoder;