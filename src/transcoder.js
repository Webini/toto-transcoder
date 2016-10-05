const Media  = require('./media.js');
const FFmpeg = require('fluent-ffmpeg');
const fs     = require('fs');
const path   = require('path');
const mkdir  = require('mkdirp');

const imageSubtitleCodecs = [ 'dvdsub', 'dvbsub', 'vobsub' ]; 

/**
 * @param {String} file File path
 * @param {Function|null} progressCallback Progression Callback
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
  
  if (debug) {
    ffo.on('start', (commandLine) => {
      console.log('Spawned Ffmpeg with command: ' + commandLine);
    });
  }

  ffo.on('end', removeListener);
  ffo.on('error', removeListener);

  return ffo;
}

function toKb(bits) {
  return parseInt(bits / 1024).toString() + 'k';
}

class Transcoder {
  constructor({ presets, thumbnails = null, debug, preferredLang = '^fr.*' }) {
    this.preferredLang = new RegExp(preferredLang, 'i');
    this.debug         = debug || (process.env.NODE_DEBUG || '').toLowerCase().split(' ').includes('toto-transcoder'); 
    this.presets       = presets;
    this.thumbnails    = thumbnails;
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
      const ffo             = prepareFFmpegObject(media.file, progressCallback, this.debug);
      const files           = {};
      const filters         = [];
      let mainVideoStream   = `0:${media.best.video.index}`;

      //if we are using dvdsub, i can't bundle them in mp4 container, 
      //so if we have found a best match, i'm going to burn them 
      if (media.best.subtitle && imageSubtitleCodecs.includes(media.best.subtitle.codec_name.toLowerCase())) {
        const newMainVideoStream = 'main_sub';
       
        filters.push({
          filter: 'overlay',
          options: 'main_w/2-overlay_w/2:main_h-overlay_h',
          inputs: [ mainVideoStream, `0:${media.best.subtitle.index}` ],
          outputs: newMainVideoStream
        });

        mainVideoStream = newMainVideoStream;
      }

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

          //video filter
          filters.push(
            `[${mainVideoStream}]` +
            `scale=${conf.video.width}:${conf.video.height}` +
            `[${filterOutName}]` 
          );

          //options.push('-t 30');
          //options.push('-ss 460');

          options.push(
            '-maxrate ' + toKb(conf.video.maxbitrate),
            '-bufsize ' + toKb(conf.video.maxbitrate * 4)
          );

          if (conf.threads) {
            options.push('-threads ' + conf.threads);
          }

          if(conf.preset){
            options.push('-preset ' + conf.preset);
          }
          
          //audio mapping
          conf.audio.tracks.forEach((track) => {
            options.push(`-map 0:${track.index}`);
          });

          //subtitles
          options.push('-scodec mov_text');

          //include compatible subtitles in mp4 container
          conf.subtitle.tracks.forEach((track) => {
            if (!imageSubtitleCodecs.includes(track.codec_name.toLowerCase())) {
              options.push(`-map 0:${track.index}`);
            }
          });
          
          //video mapping
          options.push(`-map [${filterOutName}]`);

          output.audioCodec(conf.audio.codec)
                .audioBitrate(toKb(conf.audio.bitrate))
                .audioChannels(conf.audio.channels)
                .videoCodec(conf.video.codec)
                .videoBitrate(toKb(conf.video.bitrate))
                .outputOptions(options)
                .format(conf.format);
        });

      if (this.thumbnails) {
        const directory = path.join(outputDirectory, 'thumbs');
        const file      = path.join(directory, `${filePrefix}.%03d.jpg`);
        const finalFile = path.join(outputDirectory, `${filePrefix}.thumbs.jpg`);
        const output    = ffo.output(file);
        
        try {
          mkdir.sync(directory);

          filters.push(
            `[${mainVideoStream}]` +
            `fps=${this.thumbnails.delay},` + 
            `scale=${this.thumbnails.width || -1}:${this.thumbnails.height || -1}` +
            `[thumbs]` 
          );

          output.outputOptions([ '-map [thumbs]' ]);
        } catch(e) {}

        //@todo imagemagick op after transco
        files.thumbnails = finalFile;
      }

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

  extractSubtitles(media, outputDirectory, filePrefix) {
    const promises = [];


  }
};

module.exports = Transcoder;