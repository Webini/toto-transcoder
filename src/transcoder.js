const Media       = require('./media.js');
const FFmpeg      = require('fluent-ffmpeg');
const fs          = require('fs');
const path        = require('path');
const mkdir       = require('mkdirp');
const Montage     = require('./montage.js');
const imagemagick = require('imagemagick');
const rimraf      = require('rimraf');
const map_639     = require('./iso-639-2.json');

const imageSubtitleCodecs = [ 'dvdsub', 'dvbsub', 'vobsub', 'pgssub' ]; 
const DEFAULT_THUMB_COLUMNS = 6;

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
 */
function toKb(bits) {
  return parseInt(bits / 1024).toString() + 'k';
}

/**
 * @param {String} file
 * @param {String} fileComp
 */
function orderImage(file, fileComp) {
  const nb     = parseFloat(file.match(/\.([0-9\.]+)\.jpg$/)[1]);
  const nbComp = parseFloat(fileComp.match(/\.([0-9\.]+)\.jpg$/)[1]);
  return nb - nbComp;
}

function statFile(file) {
  try {
    return fs.statSync(file)['size'];
  } catch(e) { 
    return null;
  }
}

/**
 * Combine images stack into one spritesheet
 * @param {String} directory
 * @param {String} output
 * @param {Object} thumbsConfig
 * @param {integer} thumbsConfig.cols Columns Number
 * @param {string} thumbsConfig.delay Thumbnails delay
 * @return {Promise}
 */
function combineThumbnails(directory, output, thumbsConfig) {
  return new Promise((resolve, reject) => {
    const mont = new Montage();
    const { cols = DEFAULT_THUMB_COLUMNS, delay } = thumbsConfig;

    var files = fs.readdirSync(directory); 
    if(!files || files.length <= 0){
      reject(new Error('Not thumbnails found'));
      return;
    }
    
    files.sort(orderImage);
    
    imagemagick.identify(path.join(directory, files[0]), (err, imageData) => {
      if (err) {
        try { rimraf.sync(directory); } catch(e) { }
        reject(new Error(err));
        return;
      }

      for (var i = 0; i < files.length; i++) {
        mont.addInput(path.join(directory, files[i]));
      }
        
      //transform images to spritesheet
      mont.setBackground('black')
        .setTile(cols)
        .setGeometry(['+0', '+0'])
        .setMode('concatenate')
        .setOutput(output)
        .convert()
        .then((ret) => {
          try { rimraf.sync(directory) } catch(e) { }
          
          resolve({
            meta: {
              quantity: files.length,
              size: { width: imageData.width, height: imageData.height },
              cols: cols,
              delay
            },
            file: output,
            size: statFile(output)
          });
        })
        .catch((err) => {
          reject(err);
        });
    });
  });   
}

class Transcoder {
  constructor({ presets, thumbnails = null, subtitles = null, hwAccel = false, debug, preferredLang = '^fr.*' }) {
    this.preferredLang = new RegExp(preferredLang, 'i');
    this.debug         = debug || (process.env.NODE_DEBUG || '').toLowerCase().split(' ').includes('toto-transcoder'); 
    this.presets       = presets;
    this.thumbnails    = thumbnails;
    this.subtitles     = subtitles;
    this.defaultPreset = null;
    this.hwAccel       = hwAccel;

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
   * Transcode file
   * @param {Media} Media object 
   * @param {String} outputDirectory output directory for the transcoded files
   * @param {String} filePrefix filename, then we will concat quality name & container extension, it can't contain % char
   * @param {Function|null} progressCallback
   * @return {Promise} 
   */
  transcode(media, outputDirectory, filePrefix, progressCallback) {
    const ffo  = prepareFFmpegObject(media.file, progressCallback, this.debug);

    try { mkdir.sync(outputDirectory); } catch(e) {}

    if (this.hwAccel) {
      ffo.addInputOption(`-hwaccel ${this.hwAccel}`)
    }

    const promise = new Promise((resolve, reject) => {
      const dataOutput      = {
        transcoded: {},
        subtitles: []
      };
      const filters         = [];
      const subtitles       = media.subtitles.filter((subtitle) => {
        return !imageSubtitleCodecs.includes(subtitle.codec_name);
      });
      let mainVideoStream   = `0:${media.best.video.index}`;
      let thumbnails        = null;

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

      //transco presets
      media
        .outputs
        .sort((first, second) => { //we need to desc order for complex filters 
          return (second.vbitrate + second.abitrate) - (first.vbitrate + first.abitrate);
        })
        .forEach((conf, i, outputs) => {
          const file           = path.join(outputDirectory, `${filePrefix}.${conf.name}${conf.extension ? '.' + conf.extension : ''}`);
          const output         = ffo.output(file);
          const options        = [];
          const filterOutName  = conf.name;
          const prevFilterName = (i > 0 ? outputs[i-1].name : null);

          dataOutput.transcoded[conf.name] = { 
            file,
            duration: (media.best.video.duration !== 'N/A' ? media.best.video.duration : null),
            resolution: {
              width: conf.video.width,
              height: conf.video.height
            }
          };

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

          if (this.debug) {
            options.push('-t 30');
          //options.push('-ss 460');
          }

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
          subtitles.forEach((track) => {
            options.push(`-map 0:${track.index}`);
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

      //thumbnails processing
      if (this.thumbnails) {
        const directory = path.join(outputDirectory, 'thumbs');
        const file      = path.join(directory, filePrefix).replace(/%/g, '%%') + '.%03d.jpg';
        const finalFile = path.join(outputDirectory, `${filePrefix}.thumbs.jpg`);
        const output    = ffo.output(file);
        const options   = [];

        try {
          mkdir.sync(directory);

          filters.push(
            `[${mainVideoStream}]` +
            `fps=${this.thumbnails.delay},` + 
            `scale=${this.thumbnails.width || -1}:${this.thumbnails.height || -1}` +
            `[thumbs]` 
          );

          if (this.debug) {
            options.push('-t 30');
          //options.push('-ss 460');
          }

          options.push('-map [thumbs]');

          output.outputOptions(options);

          thumbnails = {
            directory: directory,
            finalFile: finalFile,
          };
        } catch(e) {}
      }

      //subtitles extraction
      if (subtitles.length > 0) {
        subtitles.forEach((subtitle) => {
          const file    = path.join(outputDirectory, `${filePrefix}.${subtitle.index}.${this.subtitles.extension}`);
          const output  = ffo.output(file);
          const options = [];

          if (this.debug) {
            options.push('-t 30');
          //options.push('-ss 460');
          }

          options.push(
            `-scodec ${this.subtitles.codec}`,
            `-map 0:${subtitle.index}`,
            '-an',
            '-vn'
          );

          output.outputOptions(options);
          
          const code_639_2 = (subtitle.tags && subtitle.tags.language !== 'und' ? subtitle.tags.language : null);
          const language = (code_639_2 ? map_639[code_639_2].label : null);
          dataOutput.subtitles.push({
            label: (subtitle.tags ? subtitle.tags.title : null) || language || 'No Name',
            lang_639_2: code_639_2,
            lang_639_1: (code_639_2 ? map_639[code_639_2].code : null),
            lang: language,
            default: (subtitle === media.best.subtitle),
            forced: subtitle.disposition.forced ? true : false,
            file: file
          });
        });
      }

      ffo.complexFilter(filters);

      ffo.on('error', (error, stdout, stderr) => {
        if (ffo.killed) {
          reject(new Error('FFmpeg killed'));
        } else {
          reject(stderr || error || stdout);
        }
      });

      ffo.on('end', () => {
        const promises = [];

        if (thumbnails) {
          promises.push(
            combineThumbnails(thumbnails.directory, thumbnails.finalFile, this.thumbnails)
              .then((data) => { dataOutput.thumbnails = data; })
              .catch((err) => true) //@todo logger
          );
        }

        //add transcoded informations
        for(var preset in dataOutput.transcoded) {
          const transcoded = dataOutput.transcoded[preset]; 
          transcoded.size = statFile(transcoded.file);

          if (!transcoded.duration) {
            promises.push(
              this.prepare(dataOutput.transcoded[preset].file)
                .then((media) => { transcoded.duration = media.best.video.duration; })
                .catch((err) => true)
            );
          }
        }

        dataOutput.subtitles.map((subtitle) => {
          subtitle.size = statFile(subtitle.file);
          return subtitle
        });

        Promise
          .all(promises)
          .then(() => resolve(dataOutput))
          .catch((err) => reject(err));
      });
      
      ffo.run();
    });

    promise.kill = function(){
      ffo.killed = true;
      ffo.kill('SIGKILL');
    };  

    return promise;
  }
};

module.exports = Transcoder;