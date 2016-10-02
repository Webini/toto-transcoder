const Media  = require('./media.js');
const FFmpeg = require('fluent-ffmpeg');

class Transcoder {
  constructor({ presets, debug, preferredLang = '^fr.*' }) {
    this.preferredLang = new RegExp(preferredLang, 'i');
    this.debug         = debug || process.env.toLowerCase().split(' ').includes('toto-transcoder'); 
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
  create(inputFile, subtitleFile) {
    return new Promise((resolve, reject) => {
      const media = new Media({ file: inputFile, subtitle: subtitleFile });

      FFmpeg.ffprobe(media.file, (err, metadata) => {
        if(err !== null){
          reject(err);
        }    
        
        media.metadata = metadata;
        
        resolve(
          media.configureAudioSubTracks(this.preferredLang)
               .configureVideoTracks(this.presets, this.defaultPreset)
        );
      });
    });
  }


  /**
   * Transcode file
   * @param {Media} Media object 
   * @return {Promise}
   */
  transcode(media) {

  }
};

module.exports = Transcoder;