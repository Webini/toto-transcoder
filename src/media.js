const assert      = require('assert');
const forcedRegex = /force/i; //to find forced subtitles 
const _           = require('lodash');

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
    this.best           = {
      audio: null,
      video: null
    };
    this.subtitles      = null;
    this.outputs        = null;
  }

  /**
   * @param {RegExp} preferredLanguage Regex to find preferred language
   * @return {Media}
   */
  selectBestAV(preferredLanguage) {
    const allAudioTracks = findTracks('audio', this.metadata.streams);

    assert.ok(allAudioTracks.length > 0, 'Cannot found any audio track');

    this.subtitles    = findTracks('subtitle', this.metadata.streams);
    const audioTracks = findTracks('audio', allAudioTracks, preferredLanguage);
    const subTracks   = findTracks('subtitle', this.subtitles, preferredLanguage);

    //audio found
    if(audioTracks.length > 0){
      this.best.audio = audioTracks[0];
      
      //if requested audio is found, and if we have subtitles we try to incrust forced subtitle  
      for(let i = 0, sz = subTracks.length; i < sz; i++){
        if(isSubtitleForced(subTracks[i])){
          this.best.subtitle = subTracks[i];
          break;
        }
      }
    } 
    else if(subTracks.length > 0){ //audio with the needed language not found, we are going to incrust full subtitles
      for(let i = 0, sz = subTracks.length; i < sz; i++){
        if(!isSubtitleForced(subTracks[i])){
          this.best.subtitle = subTracks[i];
          break;
        }
      }
      
      //if full subtitles weren't found, fallback with forced one
      if(!this.best.subtitle){
        this.best.subtitle = subTracks[0];
      }
    }
    
    //if no audio selected, we use the first track
    if(!this.best.audio){
      this.best.audio = allAudioTracks[0];
    }
    
    return this;
  }

  /**
   * Select video track
   * @return {Media}
   */
  selectVideoTrack() {
    const qualities = [];
    const streams   = findTracks('video', this.metadata.streams);
    
    assert.ok(streams.length > 0, 'Cannot found any video track');
    
    //select first video track by default
    this.best.video = streams[0];

    return this;
  }

  /**
   * Select qualities presets for transco
   * @param {Array[Object]} presets
   * @param {Object} defaultPreset cf root directory => config.json : presets
   * @return {Media}
   */
  selectPresets(presets, defaultPreset) {
    assert.ok(!!this.best.video, 'selectVideoTrack must be called before selectPresets');
    assert.ok(!!this.best.audio, 'selectAudioAndSubTrack must be called before selectPresets');
    
    const audio           = this.best.audio;
    const video           = this.best.video;
    const outputs         = [];
    const audioTracks     = findTracks('audio', this.metadata.streams);
    
    const baseConf = {
      audio:    { tracks: audioTracks },
      video:    { track: this.best.video }
    };

    presets.forEach((preset, i) => {
      const conf = _.merge({}, preset, baseConf);
      
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
      conf.audio.bitrate = getOriginalOrDefaultBitrate(audio.bit_rate, conf.audio.bitrate);

      outputs.push(conf);
    });

    
    //if no presets are found we'll use the default preset with options adapted to the current media
    if(outputs.length <= 0){
      const conf = _.merge({}, defaultPreset, baseConf);
      
      conf.video.bitrate = getOriginalOrDefaultBitrate(video.bit_rate, conf.video.bitrate);
      conf.audio.bitrate = getOriginalOrDefaultBitrate(audio.bit_rate, conf.audio.bitrate);
      conf.video.width   = video.width;
      conf.video.height  = video.height;

      outputs.push(conf);
    }
    
    this.outputs = outputs;
    
    return this;
  }
}

module.exports = Media;