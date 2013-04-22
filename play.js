var credentials = require('./credentials');
var Spotify = require('spotify-web');
var lame = require('lame');
var Speaker = require('speaker');

// Spotify credentials...
var username = credentials.spotify_username;
var password = credentials.spotify_password;

// Get the href and user from the arguments provided when forked from parent
var href = process.argv[2];
var user = process.argv[3];
console.log(href);
console.log("child process user: " + user)

Spotify.login(username, password, function (err, spotify) {
  if (err) throw err;
  console.log("child process started");
  spotify.get(href, function (error, track) {
      if(error) throw error;
      var playing = ' Now playing: ' + track.artist[0].name + ' ~ '  + track.name;
      process.send({
        artist: track.artist[0].name,
        track: track.name,
        myUser: user
      });
      console.log(playing);
      track.play()
        .pipe(new lame.Decoder())
        .pipe(new Speaker())
        .on('finish', function () {
          process.send('finished');
        });
    });  
});
