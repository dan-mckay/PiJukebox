var cp = require('child_process');
var Spotify = require('spotify-web');
var twitter = require('ntwitter');
var credentials = require('./credentials');
var request = require('request');
var five = require("johnny-five");

var board, lcd;
board = new five.Board();

var currentTrack = '';
var currentArtist = ''; 


var child;    // variable for child process

var isPlaying = false;  // Boolean to signify if Jukebox is currently playing
var playlist = [];      // Array to store requested tracks

// Spotify credentials...
var username = credentials.spotify_username;
var password = credentials.spotify_password;

// Twitter API Authorisation
var twit = new twitter({
  consumer_key: credentials.consumer_key,
  consumer_secret: credentials.consumer_secret,
  access_token_key: credentials.access_token_key,
  access_token_secret: credentials.access_token_secret
});

twit.verifyCredentials(function (err, data) {
  if (err) {
    console.log("Error verifying Twitter credentials: " + err);
    process.exit(1);
  }
  else {
    console.log("Signed in to Twitter API");
  }
});

// Main Event Loop
board.on("ready", function() {

  lcd = new five.LCD({
    // LCD pin name  RS  EN  DB4 DB5 DB6 DB7
    // Arduino pin # 7    8   9   10  11  12
    pins: [ 12, 11, 5, 4, 3, 2 ],
    rows: 2,
    cols: 16
  });

  lcd.on("ready", function() {
    displayLCD();
  });

  Spotify.login(username, password, function (err, spotify) {
    if (err) throw err;
    // Sign up to twitter stream "PiJukebox"
    twit.stream('statuses/filter', {track:'PiJukebox'}, function (stream) {
      // Event handler for incoming data
      stream.on('data', function (tweet) {
        tweetReader(tweet, twit, function(callback) {
          console.log("emitting event to stream")
          stream.emit('next', {});
        });
      });
      stream.on('next', function() {
        playTrack(spotify, twit, stream);
      });
    });
  });
});

function tweetReader(tweet, twit, callback) {
  console.log("1")
  var command = tweet.text.substring(11, 15);
  var user = tweet.user.screen_name;
  if(command.toUpperCase() === 'PLAY') {
    var query = encodeURI(tweet.text.substring(16));
    var path = 'http://ws.spotify.com/search/1/track.json?q=' + query;
    querySpotify(path, user, callback);
  }
}

function querySpotify(spotifyURL, user, callback) {
  console.log("2")
  request(spotifyURL, function(error, response, body, cb) {
    if(error) {
      return callback(error);  
    }
    if(response.statusCode == 200) {
      console.log("3")
      var responseBody = JSON.parse(body);
      currentArtist = responseBody.tracks[0].artists[0].name;
      currentTrack = responseBody.tracks[0].name;
      href = responseBody.tracks[0].href;
      if(playlist.length < 20) {
        var trackDetails = {
          user: user,
          href: href
        };
        // Add track details to end of the queue
        playlist.push(trackDetails);
        callback();
      }
      else {
        // Notify user that playlist is full
        var listFullTweet = '@' + user + ' Sorry, playlist is full. Please try again later.';
        twit.updateStatus(fullMsg,
          function (err, data) {
            if (err) throw err;
          }
        );
        callback();
      }
    }
    else {
      // Notify user could not find resource
      var notFindTweet = '@' + user + ' Sorry, could not find what you wanted. Please try again.';
      twit.updateStatus(notFindTweet,
        function (err, data) {
          if (err) throw err;
        }
      );
      callback();
    }
  });
}

function playTrack(spotify, twit, stream) {
  if(!isPlaying && playlist.length > 0) {
    console.log("4")
    // Take first track from queue
    var currentItem = playlist.shift();
    child = cp.fork(__dirname + '/play.js', [ currentItem.href, currentItem.user ]);
    console.log("current item parent user: " + currentItem.user)
    isPlaying = true;
    child.on('exit', function() {
      console.log("Child process exited");
    });
    child.on('message', function(data) {
      if(data == 'finished') {
        child.kill();
        isPlaying = false;
        console.log("child process finished in parent");
        stream.emit('next', {});
        currentArtist = '';
        currentTrack = '';
        displayLCD();
      }
      else {
        currentArtist = data.artist;
        currentTrack = data.track;
        displayLCD();
        var userToNotify = data.myUser;
        console.log("user sent from child" + userToNotify);
        var notifyTweet = '@' + userToNotify + ' Now playing: ' + currentArtist + ' - ' + currentTrack;
        twit.updateStatus(notifyTweet,
          function (err, data) {
            if (err) throw err;
          }
        );
      }
    });
  }
}

function displayLCD() {
  lcd.clear();
  if (currentArtist === '' && currentTrack === '') {
    lcd.print("Tweet Me A Song!");
  }
  else {
    lcd.print(currentArtist);
    lcd.setCursor(0, 1);
    lcd.print(currentTrack);
  }
}

process.on('exit', function() {
  lcd.clear();
  child.kill();
})