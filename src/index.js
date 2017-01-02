const Transcoder = require('./transcoder.js');
const Media      = require('./media.js');

const TranscoFactory = function(params) {
  return new Transcoder(params);
};

TranscoFactory.Transcoder = Transcoder;

module.exports = {
  transcoder: TranscoFactory,
  media: Media
};