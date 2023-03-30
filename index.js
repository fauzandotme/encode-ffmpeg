const mediainfoParser = require("mediainfo-parser").parse;
const { exec } = require('child_process');
const shellescape = require('shell-escape');
const path = require('path');
const mime = require('mime-types')
const fs = require('fs');
const { spawn } = require('child_process');
const EventEmitter = require('events');

function info(videoPath) {
  return new Promise((resolve, reject) => {
    let command = ['mediainfo', '--Full', '--Output=XML', videoPath];
    command = shellescape(command);
    exec(command,{maxBuffer: 1024 * 5000}, (err, res) => {
      if(err) reject(err);
      mediainfoParser(res, (err, obj) => {
        if(err) reject(err)
          resolve(obj);
        });
    })
  });
}

async function split(opt = {}) {
  let output = opt.input.substr(0, opt.input.lastIndexOf(".")) + "-part.mkv";
  let command =  `mkvmerge --output '${output}' '(' '${opt.input}' ')' --split size:${opt.size}`;
  let done = await myExec(command);
  return parse(done);
  function parse(str) {
    str = str.match(/The file+.+/g);
    return str.map((el) => {
      el = el.match(/\'+.+\'/)[0]
      return el.replace(/\'/g, '');
    })
  }
}


class Encoder extends EventEmitter {
  constructor() {
    super();
    this.spawnID = null;
  }

  async encode({ input, output, subtitle = '', audio = '', codec = 'libx264', crf = 30, scale = false, logo = false, watermark = false, preset = false, overwrite = false, format = 'mp4', faststart = false }) {
    const fontPath = path.join(__dirname, 'font.ttf');
    let vfFilters = [];
    if (scale) vfFilters.push(`scale=${scale}`);
    if (subtitle) vfFilters.push(`subtitles=${subtitle.replace(/(\W)/g, "\\$1")}`);
    if (logo) vfFilters.push(`ass=${logo}`);
    if (watermark) {
      vfFilters.push(`drawtext=text='${watermark}': fontfile='${fontPath}':fontsize=24:fontcolor=white:x=10:y=10:enable='lt(mod(t,60),5)'`);
    }
  
    const command = [
      'ffmpeg', '-y', '-i', input, ...(audio ? ['-i', audio] : []), '-c:v', codec, '-c:a', 'aac', '-strict', '-2', '-crf', crf,
      ...(audio ? ['-c:a', 'aac'] : []), '-f', format,
      ...(vfFilters.length ? ['-vf', vfFilters.join(',')] : []),
      ...(preset ? ['-preset', preset] : []),
      ...(faststart ? ['-movflags', 'faststart'] : []),
      ...(overwrite ? ['-y'] : []),
      ...(codec === 'h264_videotoolbox' ? ['-b:v', '3000k'] : []),
      output,
    ];

    // console.log(command.join(' '));

    const durationRegex = /Duration: (\d{2}):(\d{2}):(\d{2})/;
    const progressRegex = /time=(\d{2}):(\d{2}):(\d{2})/;
    let duration = 0;
    let lastProgress = 0;
    return new Promise((resolve, reject) => {
      // console.log(command[0], command.slice(1))
      // console.log('do encodings');
      const ffmpeg = spawn(command[0], command.slice(1));
      // console.log(ffmpeg.pid)
      this.spawnID = ffmpeg.pid;


      ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();
        // console.log(message)
        const durationMatch = message.match(durationRegex);
        const progressMatch = message.match(progressRegex);
        if (durationMatch) {
          duration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
        }
        if (progressMatch) {
          const progress = parseInt(progressMatch[1]) * 3600 + parseInt(progressMatch[2]) * 60 + parseInt(progressMatch[3]);
          if (progress > lastProgress) {
            const percent = Math.round(progress / duration * 100);
            let fileSize = 0;
            try {
              fileSize = fs.statSync(output).size;
            } catch(e) {

            }
            this.emit('progress', {percent, fileSize});
            lastProgress = progress;
          }
        }
      });

      ffmpeg.on('error', (err) => {
        // console.log(err)
        this.emit('error', err);
        // reject(err);
      });

      ffmpeg.on('exit', (code, signal) => {
        if (code === 0) {
          const fileSize = fs.statSync(output).size;
          const data = { fileName: path.basename(output), filePath: output, fileSize };
          this.emit('success', data);
          resolve(data);
        } else {
          this.emit('error', {message: `ffmpeg exited with code ${code} and signal ${signal}`});
          // reject({ error: new Error(`ffmpeg exited with code ${code} and signal ${signal}`) });
        }
      });
    });
  }
  stop() {
    if (this.spawnID) {
      try {
        exec(`kill -9 ${this.spawnID}`, (err, stdout, stderr) => {
          if (err) {
            // console.error(`Error stopping ffmpeg process with ID ${this.spawnID}:`, err);
          } else {
            // console.log(`Stopped ffmpeg process with ID ${this.spawnID}`);
          }
        });
        this.spawnID = null;
      } catch(e) {
        // console.error(`Error stopping ffmpeg process with ID ${this.spawnID}:`, e);
      }
    }
  }
}

async function encode({ input, output, subtitle = '', codec = 'libx264', crf = 30, scale = false, logo = false, preset = false, overwrite = false, format = 'mp4', faststart = false }) {
  const logoFilter = logo && typeof logo === 'string' ?
    /^[a-zA-Z0-9.]{1,20}$/.test(logo) ?
      `drawtext=text='${logo}':fontcolor=white:fontsize=24:x=10:y=10:enable='between(mod(t,60),0,10)':setdar=${scale}` :
      `overlay=10:10:enable='between(mod(t,60),0,10)'` :
    logo && typeof logo !== 'string' ?
      `overlay=10:10:enable='between(mod(t,60),0,10)'` :
    '';

  const vfFilters = [
    ...(logoFilter ? ['-vf', logoFilter] : []),
    ...(scale ? ['-vf', `scale=${scale}`] : []),
    ...(subtitle ? ['-vf', `subtitles=${subtitle.replace(/(\W)/g, "\\$1")}`] : []),
  ];

  const filterComplex = logo && typeof logo === 'string' && !/^[a-zA-Z0-9.]{1,20}$/.test(logo) ?
    ['-i', logo, '-filter_complex', logoFilter] :
    [];

  const command = [
    'ffmpeg', '-y', '-i', input, '-c:v', codec, '-crf', crf, '-f', format,
    ...filterComplex,
    ...vfFilters,
    ...(preset ? ['-preset', preset] : []),
    ...(faststart ? ['-movflags', 'faststart'] : []),
    ...(overwrite ? ['-y'] : []),
    output,
  ];

  const durationRegex = /Duration: (\d{2}):(\d{2}):(\d{2})/;
  const progressRegex = /time=(\d{2}):(\d{2}):(\d{2})/;
  let duration = 0;
  let lastProgress = 0;

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(command[0], command.slice(1));

    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString();
      const durationMatch = message.match(durationRegex);
      const progressMatch = message.match(progressRegex);
      if (durationMatch) {
        duration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
      }
      if (progressMatch) {
        const progress = parseInt(progressMatch[1]) * 3600 + parseInt(progressMatch[2]) * 60 + parseInt(progressMatch[3]);
        if (progress > lastProgress) {
          const percent = Math.round(progress / duration * 100);
          console.log(`Encoding progress: ${percent}%`);
          lastProgress = progress;
        }
      }
    });

    ffmpeg.on('error', (err) => {
      reject(err)
    });

    ffmpeg.on('exit', (code, signal) => {
      if (code === 0) {
        const fileSize = fs.statSync(output).size;
        resolve({ fileName: path.basename(output), filePath: output, fileSize });
      } else {
        reject({ error: new Error(`ffmpeg exited with code ${code} and signal ${signal}`) });
      }
    });
  });
}



function getSS(input, output, time = false) {
  if(!time) time = '00:01:00';
  return new Promise((resolve, reject) => {
    if(!/video/g.test(mime.lookup(input))) reject({message: 'Not a video file!'});
    let command = ['ffmpeg', '-ss',time,'-i',input,'-vframes','1','-vcodec','png','-an','-y', output];
    command = shellescape(command);
    exec(command,{maxBuffer: 1024 * 5000}, (err, res) => {
      if(err) reject(parseError(err));
      resolve({fileName: path.basename(output), filePath: output});
    })
  })
}

function getSub(input, output, track = false) {
  return new Promise((resolve, reject) => {
    if(!track) track = 0;
    let command = ['ffmpeg', '-i', input, '-y', '-map',`0:s:${track}`, output];
    command = shellescape(command);
    exec(command,{maxBuffer: 1024 * 5000}, (err, res) => {
      if(err) reject(parseError(err));
      resolve({fileName: path.basename(output), filePath: output});
    })
  })
}

function parseError(err) {
  try {
    err = err.message.trim().split('\n');
    return {message: err[err.length -1]};
  } catch (e) {
    return err;
  }
}

function myExec(cmd) {
  return new Promise((resolve,reject) => {
    exec(cmd,{maxBuffer: 1024 * 5000}, (err, res) => {
      if(err) reject(parseError(err));
      resolve(res);
    })
  })
}

class Curl extends EventEmitter {
  constructor() {
    super();
    this.curlProcess = null;
  }

  async makeRequest({ url, method = 'GET', data = null, headers = {}, output = '' }) {
    const curlCommand = ['curl', '-X', method.toUpperCase(), '-H', 'Content-Type: application/json', ...Object.entries(headers).map(([key, value]) => `-H "${key}: ${value}"`)];
    if (data) {
      curlCommand.push('-d', JSON.stringify(data));
    }
    if (output) {
      curlCommand.push('-o', output);
    }
    if (method.toUpperCase() === 'GET') {
      curlCommand.push('--progress-bar');
    }
    console.log('Executing curl command:', curlCommand.join(' '));

    return new Promise((resolve, reject) => {
      const curl = spawn(curlCommand[0], curlCommand.slice(1));
      this.curlProcess = curl;

      let totalBytes = 0;
      let uploadedBytes = 0;

      curl.stderr.on('data', (data) => {
        const message = data.toString();
        if (method.toUpperCase() === 'GET') {
          const match = message.match(/(\d+)%\s+/);
          if (match) {
            const percent = parseInt(match[1]);
            this.emit('progress', { percent });
          }
        } else {
          const match = message.match(/(\d+)\/(\d+)/);
          if (match) {
            uploadedBytes = parseInt(match[1]);
            totalBytes = parseInt(match[2]);
            const percent = Math.round(uploadedBytes / totalBytes * 100);
            this.emit('progress', { percent, uploadedBytes, totalBytes });
          }
        }
      });

      curl.on('exit', (code, signal) => {
        if (code === 0) {
          if (output) {
            const data = { fileName: path.basename(output), filePath: output };
            this.emit('success', data);
            resolve(data);
          } else {
            this.emit('success');
            resolve();
          }
        } else {
          this.emit('error', { message: `curl exited with code ${code} and signal ${signal}` });
          reject({ error: new Error(`curl exited with code ${code} and signal ${signal}`) });
        }
      });
    });
  }

  stop() {
    if (this.curlProcess) {
      const pid = this.curlProcess.pid;
      exec(`kill -9 ${pid}`, (error, stdout, stderr) => {
        if (error) {
          this.emit('error', { message: error.toString() });
        } else {
          this.emit('success', { message: `Stopped curl process with ID ${pid}` });
        }
      });
      this.curlProcess = null;
    }
  }
}


module.exports = {getSS, encode, Encoder, info, getSub, split, Curl};
