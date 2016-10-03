const assert      = require('assert');
const forcedRegex = /force/i; //to find forced subtitles 

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
   * @param {String} subtitle path
   */
  constructor({ file, metadata, subtitle = null }) {
    this.file           = file;
    this.metadata       = metadata;
    this.customSubtitle = subtitle;
    this.map            = {
      audio:    null,
      subtitle: null,
      video:    null
    };
    this.qualities      = null;
  }

  /**
   * @param {RegExp} preferredLanguage Regex to find preferred language
   * @return {Media}
   */
  selectAudioAndSubTrack(preferredLanguage) {
    const allAudioTracks = findTracks('audio', this.metadata.streams);

    assert.ok(allAudioTracks.length > 0, 'Cannot found any audio track');

    const audioTracks = findTracks('audio', allAudioTracks, preferredLanguage);
    const subTracks   = findTracks('subtitle', this.metadata.streams, preferredLanguage);

    //audio found
    if(audioTracks.length > 0){
      this.map.audio = audioTracks[0];
      
      //if requested audio is found, and if we have subtitles we try to incrust forced subtitle  
      for(let i = 0, sz = subTracks.length; i < sz; i++){
        if(isSubtitleForced(subTracks[i])){
          this.map.subtitle = subTracks[i];
          break;
        }
      }
    } 
    else if(subTracks.length > 0){ //audio with the needed language not found, we are going to incrust full subtitles
      for(let i = 0, sz = subTracks.length; i < sz; i++){
        if(!isSubtitleForced(subTracks[i])){
          this.map.subtitle = subTracks[i];
          break;
        }
      }
      
      //if full subtitles weren't found, fallback with forced one
      if(!this.map.subtitle){
        this.map.subtitle = subTracks[0];
      }
    }
    
    //if no audio selected, we use the first track
    if(!this.map.audio){
      this.map.audio = allAudioTracks[0];
    }
    
    return this;
  }

  /**
   * Select video track
   * @return {Media}
   */
  selectVideoTrack(presets, defaultPreset) {
    const qualities = [];
    const streams   = findTracks('video', this.metadata.streams);
    
    assert.ok(streams.length > 0, 'Cannot found any video track');
    
    //select first video track by default
    this.map.video = streams[0];

    return this;
  }

  /**
   * Select qualities presets for transco
   * @param {Array[Object]} presets
   * @param {Object} defaultPreset
   * @return {Media}
   */
  selectPresets(presets, defaultPreset) {
    const video     = this.map.video;
    const audio     = this.map.audio;
    const qualities = [];

    assert.ok(!!video, 'selectVideoTrack must be called before selectPresets');
    assert.ok(!!audio, 'selectAudioAndSubTrack must be called before selectPresets');
    
    presets.forEach((preset, i) => {
      const cHeight = preset.height;
      const cWidth  = preset.width;
      const oQal    = Object.assign({}, preset);
      let pusheable = false;
      
      if(video.height >= cHeight){
        oQal.width = Math.round(video.width / video.height * oQal.height); //auto width
        oQal.width += oQal.width % 2; //must be divisible by 2
        pusheable = true;
      }
      else if(video.width >= cWidth){
        oQal.height = Math.round(video.height / video.width * oQal.width); //auto height
        oQal.height += oQal.height % 2; //must be divisible by 2
        pusheable = true;
      }

      if (pusheable) {
        oQal.vbitrate = getOriginalOrDefaultBitrate(video.bit_rate, oQal.vbitrate);
        oQal.abitrate = getOriginalOrDefaultBitrate(audio.bit_rate, oQal.abitrate);
        qualities.push(oQal);
      }
    });

    
    //if no qualities are found we'll use the default quality with options adapted to the current media
    if(qualities.length <= 0){
      const oQal = Object.assign({}, defaultPreset);
      
      oQal.vbitrate = getOriginalOrDefaultBitrate(video.bit_rate, oQal.vbitrate);
      oQal.abitrate = getOriginalOrDefaultBitrate(audio.bit_rate, oQal.abitrate);
      oQal.width    = video.width;
      oQal.height   = video.height;
      qualities.push(oQal);
    }
    
    this.qualities = qualities;
    
    return this;
  }
}

module.exports = Media;