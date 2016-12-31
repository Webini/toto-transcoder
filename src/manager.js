class Manager {
  constructor({ transcoders, presets }) {

  }

  /**
   * Transcode a media
   * Prepare preset and send preset to the transcoder worker queue
   * @param {Media} media
   * 
   *            [ RabbitMq ]
   *              /      \
   *    [ File Queue ] [ Transcoding Queue ]
   *          |                 ^        |
   *          v                 |        | < prefetch ( limit to maxInstances 
   *     [ Manager ] ------------        |   defined for each transcoders )
   *        |   ^   ( ^ calculate and    |
   *        |   |       send presets )   |
   *        |   --------------------------
   *        |--------------
   *        v             v
   *  [ Transcoder A ] [ Transcoder B ]
   *  ( ^ Transcode preset received from transcoding Queue )
   */
  transcode(media) {

  }

}

module.exports = Manager;