const Montage     = require('./montage.js');
const imagemagick = require('imagemagick');
const fs          = require('fs');
const statFile    = require('./utils/statFile.js');
const path        = require('path');

const DEFAULT_THUMB_COLUMNS = 6;

/**
 * @param {String} file
 * @param {String} fileComp
 */
function orderImage(file, fileComp) {
  const nb     = parseFloat(file.match(/\.([0-9]+)\.?[a-zA-Z]*$/)[1]);
  const nbComp = parseFloat(fileComp.match(/\.([0-9]+)\.?[a-zA-Z]*$/)[1]);
  return nb - nbComp;
}

class Thumbnails {
  /**
   * Creates an instance of Thumbnails.
   * 
   * @param {String} thumbsDirectory
   * @param {Number} columns
   * 
   * @memberOf Thumbnails
   */
  constructor(thumbsDirectory, columns) {
    this.directory = thumbsDirectory;
    this.columns   = columns || DEFAULT_THUMB_COLUMNS;
  }

  /**
   * Combine thumbnails into one file
   * @param {String} outFile
   * @returns {Promise} resolve an Object with { file: <filepath>, cols: <int>, quantity: <int>, filesize: <int>, size: { width: <int>, height: <int> }}
   * 
   * @memberOf Thumbnails
   */
  combine(outFile) {
    return new Promise((resolve, reject) => {
      const mont = new Montage();

      var files = fs.readdirSync(this.directory); 
      if(!files || files.length <= 0){
        reject(new Error('Not thumbnails found'));
        return;
      }
      
      files.sort(orderImage);
      
      imagemagick.identify(path.join(this.directory, files[0]), (err, imageData) => {
        if (err) {
          reject(new Error(err));
          return;
        }

        files.forEach((file) => {
          mont.addInput(path.join(this.directory, file));
        });
          
        //transform images to spritesheet
        mont.setBackground('black')
          .setTile(this.columns)
          .setGeometry(['+0', '+0'])
          .setMode('concatenate')
          .setOutput(outFile)
          .convert()
          .then((ret) => {
            resolve({
              quantity: files.length,
              size: { width: imageData.width, height: imageData.height },
              cols: this.columns,
              file: outFile,
              filesize: statFile(outFile)
            });
          })
          .catch((err) => {
            reject(err);
          });
      });
    });
  }
}

module.exports = Thumbnails;