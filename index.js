const ffmpeg = require('ffmpeg');
const mediainfoParser = require("mediainfo-parser").parse;
const exec = require('child_process').exec;

module.exports = {getSS, encode, info};

function info(videoPath) {
  return new Promise((resolve, reject) => {
    exec(`mediainfo --Full --Output=XML "${videoPath}"`,{maxBuffer: 1024 * 5000}, (err, res) => {
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
    let codec = opt.codec ? opt.codec : 'h264';
    let crf = opt.crf ? opt.crf : '30';
    let scale = opt.scale ? opt.scale : false;
    let logo = opt.logo ? opt.logo : false;
    let preset = opt.preset ? opt.preset : false;
    let overwrite = opt.overwrite ? opt.overwrite : false;
    let format = opt.format ? opt.format : 'mp4';
    try {
      var process = new ffmpeg(input);
      process.then(function (video) {
        if(codec) video.setVideoCodec(codec);
        if(format) video.setVideoFormat(format) ;

        let vf = [];
        if(subtitle) vf.push(`subtitles=${subtitle}`);
        if(scale) vf.push(`scale=${scale}`);
        if(logo) vf.push(`ass=${logo}`);
        if(vf.length > 0) video.addCommand('-vf', `'${vf.join(', ')}'`);
        if(preset)
        if(preset) video.addCommand('-preset', preset);
        if(crf) video.addCommand('-crf', crf);
        if(overwrite) video.addCommand('-y', '')

        video.save(output, function (error, file) {
    			if(error) reject(error);
    			resolve(file);
    		});
      }, function (err) {
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}



function getSS(input, output) {
  return new Promise((resolve, reject) => {
    try {
      var process = new ffmpeg(input);
    	process.then(function (video) {
        video.fnExtractFrameToJPG(output, {number: 3, every_n_frames: '100'}, function(error, files) {
          if(error) reject(error)
          resolve(files);
        } )
    	}, function (err) {
    		reject(err)
    	});
    } catch (e) {
      reject(e);
    }
  })
}
