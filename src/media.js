const assert      = require('assert');
const forcedRegex = /force/i; //to find forced subtitles 
const _           = require('lodash');
const FFmpeg      = require('fluent-ffmpeg');

/**
 * Find all tracks for a given codec and a specific regex
 * @param {String} codeType Code type name => video, audio, subtitle ...
 * @param {Array} streams 
 * @param {RegExp} regex Regex (optional) if not defined all matching codeType are returned
 * @return {Array}
 */
function findTracks(codecType, streams, regex){
  var out = [];
  
  for(var key in streams){
    if(streams[key].codec_type.toLowerCase() === codecType.toLowerCase()){
      if(!regex){
        out.push(streams[key]);
      }
      else if(streams[key].tags){
        regex.lastIndex = 0;
        if(regex.test(streams[key].tags.language)){
          out.push(streams[key]);
          continue;
        }

        regex.lastIndex = 0;
        if(regex.test(streams[key].tags.title)){
          out.push(streams[key]);
        }
      }
    }
  }
  
  return out;
}

/**
 * Check if @subtitle is force
 * @param {Object} subtitle
 * @return {Object}
 */
function isSubtitleForced(subtitle){
  return ((subtitle.disposition && subtitle.disposition.forced) || 
          (subtitle.tags.NUMBER_OF_FRAMES && subtitle.tags.NUMBER_OF_FRAMES <= 50) ||  //mkvmerge provided data, we try to guess forced subtitle here
          forcedRegex.test(subtitle.tags.title));
};


/**
 * Retreive right bitrate 
 * @param {Integer|null|undefined|String} originalValue Original bitrate
 * @param {Integer} defaultValue Default bitrate
 * @return {Integer} bitrate 
 */
function getOriginalOrDefaultBitrate(originalValue, defaultValue){
  if(originalValue && originalValue !== 'N/A' && originalValue < defaultValue){
      return originalValue;
  }
  return defaultValue;
};

/**
 * @todo Use the "default" field in stram[X].disposition to improve track selection
 */
class Media {
  /**
   * Constructor
   * @param {String} file File path
   * @param {Object} metadata Ffmpeg metadata
   */
  constructor({ file, metadata }) {
    this.file           = file;
    this.metadata       = metadata;
  }

  get metadata() {
    return this._metadata;
  }

  set metadata(metadata) {
    if (metadata && metadata.streams) {
      this.tracks = {
        audio:    findTracks('audio', metadata.streams),
        video:    findTracks('video', metadata.streams),
        subtitle: findTracks('subtitle', metadata.streams),
      }
    } else {
      this.tracks = { audio: [], video: [], subtitle: [] };
    }

    this._metadata = metadata;
  }

  /**
   * Find best audio and subtitles tracks
   * @param {RegExp} preferredLanguage Regex to find preferred language
   * @return {Media}
   */
  findBestAS(preferredLanguage) {
    assert.ok(this.tracks.audio.length > 0, 'Cannot found any audio track');

    const audioTracks = findTracks('audio', this.tracks.audio, preferredLanguage);
    const subTracks   = findTracks('subtitle', this.tracks.subtitle, preferredLanguage);
    const tracks      = {};

    //audio found
    if(audioTracks.length > 0){
      tracks.audio = audioTracks[0];
      
      //if requested audio is found, and if we have subtitles we try to incrust forced subtitle  
      for(let i = 0, sz = subTracks.length; i < sz; i++){
        if(isSubtitleForced(subTracks[i])){
          tracks.subtitle = subTracks[i];
          break;
        }
      }
    } 
    else if(subTracks.length > 0){ //audio with the needed language not found, we are going to incrust full subtitles
      for(let i = 0, sz = subTracks.length; i < sz; i++){
        if(!isSubtitleForced(subTracks[i])){
          tracks.subtitle = subTracks[i];
          break;
        }
      }
      
      //if full subtitles weren't found, fallback with forced one
      if(!tracks.subtitle){
        tracks.subtitle = subTracks[0];
      }
    }
    
    //if no audio selected, we use the first track
    if(!tracks.audio){
      tracks.audio = this.tracks.audio[0];
    }
    
    return tracks;
  }

  /**
   * Select video track
   * @return {Media}
   */
  findVideoTrack() {
    if (this.tracks.video.length <= 0) {
      return null;
    }
    //select first video track by default
    return this.tracks.video[0];
  }

  /**
   * Configure presets for this media
   * @param {Array[Object]} presets
   * @param {Object} defaultPreset cf root directory => config.json : presets
   * @return {Media}
   */
  configurePresets({ audioTrack, presets, defaultPreset } = { audioTrack: null }) {
    const audio           = audioTrack || this.findBestAS(/.*/).audio;
    const video           = this.findVideoTrack();
    const subtitle        = this.tracks.subtitle;
    const outputs         = [];
    const audioTracks     = this.tracks.audio;

    function generateConf(preset) {
      const baseConf = {};
      if (preset.audio) {
        baseConf.audio = { tracks: audioTracks };
      }

      if (preset.video) {
        baseConf.video = { track: video };
      }

      if (preset.subtitle) {
        baseConf.subtitle = { tracks: subtitle }
      }

      if (preset.thumbnails && video) {
        baseConf.thumbnails = { track: video };
      }

      return _.merge({}, preset, baseConf);
    }

    presets.forEach((preset, i) => {
      const conf = generateConf(preset);
      
      if (conf.video) {
        if(video.height >= conf.video.height){
          conf.video.width = Math.round(video.width / video.height * conf.video.height); //auto width
          conf.video.width += conf.video.width % 2; //must be divisible by 2
        }
        else if(video.width >= conf.video.width){
          conf.video.height = Math.round(video.height / video.width * conf.video.width); //auto height
          conf.video.height += conf.video.height % 2; //must be divisible by 2
        }
        else {
          return;
        }
      
        conf.video.bitrate = getOriginalOrDefaultBitrate(video.bit_rate, conf.video.bitrate);
      }

      /** Put this in transcoder not here, we have more than 1 audio track now */
      if (conf.audio) {
        conf.audio.bitrate = getOriginalOrDefaultBitrate(audio.bit_rate, conf.audio.bitrate);
      }

      outputs.push(conf);
    });

    
    //if no presets are found we'll use the default preset with options adapted to the current media
    if(outputs.length <= 0){
      const conf =  generateConf(defaultPreset);
      
      if (conf.video) {
        conf.video.bitrate = getOriginalOrDefaultBitrate(video.bit_rate, conf.video.bitrate);
        conf.video.width   = video.width;
        conf.video.height  = video.height;
      }

      if (conf.audio) {
        conf.audio.bitrate = getOriginalOrDefaultBitrate(audio.bit_rate, conf.audio.bitrate);
      }

      outputs.push(conf);
    }
    
    return outputs;
  }
}

/**
 * Create a new Media and hydrate it with metadata
 * @param {String} inputFile
 * @return {Promise}
 */
module.exports = function(file) {
  return new Promise((resolve, reject) => {
    FFmpeg.ffprobe(file, (err, metadata) => {
      if(err){
        return reject(err);
      }
      
      const media = new Media({ file, metadata });        
      resolve(new Media({ file, metadata }));
    });
  });  
};

module.exports.Media = Media;