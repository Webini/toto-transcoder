const spawn = require('child_process').spawn;
    
class Montage {
  constructor() {
    this.input = [];
    this.output = null;
    this.geometry = null;
    this.tile = null;
    this.background = null;
    this.mode = null;
  }

  /**
   * Add input file
   * @param {string} file
   * @return {Montage}
   */
  addInput(file){
    this.input.push(file);
    return this;
  };

  /**
   * Set lines & row for output image
   * @param {integer} cols
   * @param {integer} rows
   * @return {Montage}
   */
  setTile(cols, rows){
    this.tile = { cols: cols, rows: rows };
    return this;
  };    
  
  /**
   * Set geometry
   * @param {array} geom
   * @return {Montage}
   */
  setGeometry(geom){
    this.geometry = geom;  
    return this;
  };
  
  /**
   * Set background
   * @param {string} color
   * @return {Montage}
   */
  setBackground(color){
    this.background = color;
    return this;
  };
  
  /**
   * SEt output file
   * @param {string} output
   * @return {Montage}
   */
  setOutput(output){
    this.output = output;
    return this;
  };
  
  /**
   * Set mode
   * @param {string} mode
   * @return {Montage}
   */
  setMode(mode){
    this.mode = mode;
    return this;  
  };
  
  /**
   * Create parameters for cli
   * @return {Array}
   */
  _getParams(){
    let params = [];
    
    if(this.input.length <= 0){
      throw new Error('Input not defined');
    }
    
    if(this.mode){
      params.push('-mode');
      params.push(this.mode);
    }
    
    if(this.background){
      params.push('-background');
      params.push(this.background);
    }
    
    if(this.geometry){
      params.push('-geometry');
      params.push(this.geometry.join(''));
    }
    
    if(this.tile){
      params.push('-tile');
      params.push((this.tile.cols ? this.tile.cols : '') + 'x' + (this.tile.rows ? this.tile.rows : '')); 
    }
    
    if(this.output === null){
      throw new Error('Output not defined');
    }
    
    params = params.concat(this.input);
    params.push(this.output);
    
    return params;
  };
  
  /**
   * Execute convertion
   * @return {Promise}
   */
  convert(){
    return new Promise((resolve, reject) => {
      const child = spawn('montage', this._getParams());
      let data    = '';
      
      child.stdout.on('data', function(response){
        data += response;
      });
      
      child.stderr.on('data', function(err){
        data += err;  
      });
      
      child.on('exit', function(code, signal){
        if(code === 0){
          resolve(data);
        }
        else{
          reject(new Error(data));
        }
      });
    });
  };
}

module.exports = Montage;

