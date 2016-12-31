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
   * 
   * Better hypothesis 
   *            [ RabbitMq ]
   *              /      \
   *    [ File Queue ] [ Transcoding Queue ] <= replaceable by an std event emitter
   *          |                 ^        |      but we loose maxInstances with the prefetch
   *          v                 |        |      opt of rabbit and worker queue, so duplication
   *     [ Manager ] ------------        |      of messages
   *                ( ^ calculate and    |
   *                    send presets )   |
   *                                     |
   *     ---------------------------------
   *     v                      v
   *   [ Transcoder A ]  [ Transcoder B ] <= we can put evt emitter here but we have to 
   *                                         reimplement the worker logic in the manager
   *                                         to dispatch messages one by one to the free
   *                                         transcoder
   * 
   * We have to add a notification queue for transcoding progress
   * the manager must not handle transcoder configuration or maybe remove
   * it, focus only on transcoder, and let the devs play as they want
   * KISS
   */
  transcode(media) {

  }

}

module.exports = Manager;