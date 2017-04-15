const mediainfoParser = require("mediainfo-parser").parse;
const exec = require('child_process').exec;
const shellescape = require('shell-escape');
const path = require('path');
const mime = require('mime-types')

module.exports = {getSS, encode, info, getSub};

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

function encode(opt = {}) {
  return new Promise((resolve, reject) => {
    let input = opt.input ? opt.input : reject({message: 'empty input file'});
    let output = opt.output ? opt.output : reject({message: 'empty output file'});
    let subtitle = opt.subtitle ? opt.subtitle : '';
    let codec = opt.codec ? opt.codec : 'libx264';
    let crf = opt.crf ? opt.crf : '30';
    let scale = opt.scale ? opt.scale : false;
    let logo = opt.logo ? opt.logo : false;
    let preset = opt.preset ? opt.preset : false;
    let overwrite = opt.overwrite ? opt.overwrite : false;
    let format = opt.format ? opt.format : 'mp4';
    let faststart = opt.faststart ? opt.faststart : false;


    let command = ['ffmpeg', '-i', input];
    if(codec) Array.prototype.push.apply(command, ['-c:v', codec]);
    if(format) Array.prototype.push.apply(command, ['-f', format]);
    let vf = [];
    if(subtitle) vf.push(`subtitles=${subtitle.replace(/(\W)/g, "\\$1")}`);
    if(scale) vf.push(`scale=${scale}`);
    if(logo) vf.push(`ass=${logo}`);
    if(vf.length > 0) Array.prototype.push.apply(command, ['-vf', vf.join(', ')]);
    if(preset) Array.prototype.push.apply(command, ['-preset', preset]);
    if(crf) Array.prototype.push.apply(command, ['-crf', crf]);
    if(overwrite) command.push('-y');
    if(faststart) Array.prototype.push.apply(command, ['-movflags', 'faststart']);
    command.push(output);
    command = shellescape(command);
    exec(command,{maxBuffer: 1024 * 5000}, (err, res) => {
      if(err) reject(parseError(err));
      resolve({fileName: path.basename(output), filePath: output});
    })
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
