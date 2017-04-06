# Required
``
ffmpeg
mediainfo
``
# HOW TO USE

``
const encode = require('encode-ffmpeg');
``

## Video Info
``
encode.info('/home/fauzan/Videos/anime.mkv').then((info) => {
  console.log(info);
}).catch((err)=> {
  console.log(err);
})
``

## Encode Video
``
let args = {
  input: '/home/fauzan/Videos/anime.mkv',
  output: '/home/fauzan/Videos/output6.mp4',
  subtitle: '/home/fauzan/Videos/anime.mkv',
  codec: 'h264',
  crf: '30',
  scale: '-1:480',
  overwrite: true,
  format: 'mp4'
}
encode.encode(args)
  .then((result) => {
    console.log(result);
  })
  .catch((err) => {
    console.log(err)
  })
``
## Get Screenshot
``
encode.getSS('/input/file.mkv', '/output/dir')
  .then((files) => {
    // display array of output files
    console.log(files);
  })
  .catch((err) => {
    // display error
    console.log(err)
  })
``
