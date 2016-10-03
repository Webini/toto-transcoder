const Media  = require('./media.js');
const FFmpeg = require('fluent-ffmpeg');
const fs     = require('fs');
const path   = require('path');

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
        if(err !== null){
          return reject(err);
        }
        
        media.metadata = metadata;
        
        resolve(
          media.selectAudioAndSubTrack(this.preferredLang)
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
        .qualities
        .sort((first, second) => { //we need to desc order for complex filters 
          return (second.vbitrate + second.abitrate) - (first.vbitrate + first.abitrate);
        })
        .forEach((quality, i, qualities) => {
          console.log('DOING => ', quality.name);
          const file          = path.join(outputDirectory, `${filePrefix}.${quality.name}.${quality.format}`);
          const output        = ffo.output(file);
          const options       = [];
          const filterOutName = quality.name;
          const prevFilterName = (i > 0 ? qualities[i-1].name : null);

          files[quality.name] = file;

          //trying to remove file if exists
          try {
              fs.unlinkSync(outFile);
          } catch(e) { }

          filters.push({ 
            filter: 'scale', 
            inputs: (!prevFilterName ? ('0:' + media.map.video.index) : prevFilterName),
            options: quality.width + ':' + quality.height,
            outputs: filterOutName
          });
          /**
           * @todo créer le premier filtre a partir du plus grand preset & incruster les ST, 
           * puis split les encoders en qualities.length avec quality.name qui fournira un 
           * output ${quality.name}.out
           */

          options.push(
            '-maxrate ' + quality.maxbitrate,
            '-bufsize ' + (quality.maxbitrate * 4),
            '-map 0:'   + media.map.audio.index
          );

          if (quality.threads) {
            options.push('-threads ' + quality.threads);
          }

          if(quality.preset){
            options.push('-preset ' + quality.preset);
          }

          /**
           * @todo incrust subtitles 
           */

          options.push(`-map [${filterOutName}]`);

          output.audioCodec(quality.acodec)
                .audioBitrate(quality.abitrate)
                .audioChannels(quality.channel)
                .videoCodec(quality.vcodec)
                .videoBitrate(quality.vbitrate)
                .outputOptions(options)
                .format(quality.format);
        });

      ffo.complexFilter(filters);

      ffo.on('error', (error, stdout, stderr) => {
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