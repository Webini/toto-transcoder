const EventEmitter = require('events');
const assert       = require('assert');
const SCALE_FILTER = 'scale';
const FPS_FILTER   = 'fps';

class Transcoder {
  /**
   * @param {Object} [param]
   * @param {Object} [param.emitter=EventEmitter] Custom event emitter or fallback to node event emitter
   * @param {Object} param.conf
   * @param {integer} [param.conf.maxInstances=null] Max transcoder instances that can run simultaneously, if not set there is not limits
   * @param {Object} param.conf.encoders Object containing { codecName: encoderName, ... }, must be set, if an encoders is not found for preset the transcoder will not transcode
   * @param {Object} [param.conf.filters=null] Object containing { filterName: newFilterName } if this object is not set all filters are accepted, if this object is defined you must define all filters else it will not transcode media
   * @param {String[]} [param.conf.codecBlacklist=[]] Array of blacklisted codec, it will not process the tracks associated with this codec
   * @param {Object} [param.conf.decoders=null] Object containing { codecName: decoderName }, if not found the transcoder cannot process the media, if this parameter is not set, the transcoder will accept all codecs
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
   * If not decoders are defined (we will not select decoders in ffmpeg), this method return null
   * If decoders are defined it will return undefined or the decoderName
   * 
   * @param {any} codecName
   * @returns {(null|undefined|String)}
   * 
   * @memberOf Transcoder
   */
  getDecoder(codecName) {
    if (!this.conf.decoders) {
      return null;
    }
    return this.conf.decoders[codecName];
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
   * @param {any} codecName
   * @returns {Boolean}
   * 
   * @memberOf Transcoder
   */
  canDecode(codecName) {
    if (!this.conf.decoders) {
      return true;
    }

    return (this.conf.decoders[codecName] !== undefined);
  }

  /**
   * Check if a codec is blacklisted
   * 
   * @param {any} codecName
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
   * @param {any} preset
   * 
   * @memberOf Transcoder
   */
  canProcess(configuredPreset) {
    const decoders = [];
    const encoders = [];
    const filters  = [];
    //@todo extract codec & filters from preset

  }
}

module.exports = Transcoder;