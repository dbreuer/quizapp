require('newrelic');
// Import the Express module
var config = require('./oauth.js')
    , express = require('express')
    , mongoose = require('mongoose')
    , passport = require("passport")
    , LocalStrategy = require('passport-local').Strategy
    , FacebookStrategy = require('passport-facebook').Strategy
    , util = require('util');

//mongoose.connect("mongodb://192.168.1.3:27017/quizzapp10");

mongoose.connect("mongodb://heroku_app29092077:q3h2soot09qd5udkj846pc9jib@ds033760.mongolab.com:33760/heroku_app29092077")

mongoose.connection.on('open', function(){
  mongoose.connection.db.collectionNames(function(error, names) {
    if (error) {
      throw new Error(error);
    } else {
      names.map(function(name) {
        console.log('found collection %s', name);
      });
    }
  });
});

var localUserSchema = new mongoose.Schema({
username: String,
salt: String,
hash: String
});

var Users = mongoose.model('userauths', localUserSchema);

var FacebookUserSchema = new mongoose.Schema({
    fbId: String,
    email: { type : String , lowercase : true},
    name : String,
    fullName : String,
    score : Number
});
var FbUsers = mongoose.model('fbs',FacebookUserSchema);


passport.use(new LocalStrategy(function(username, password,done){
    Users.findOne({ username : username},function(err,user){
        if(err) { return done(err); }
        if(!user){
            return done(null, false, { message: 'Incorrect username.' });
        }

        hash( password, user.salt, function (err, hash) {
            if (err) { return done(err); }
            if (hash == user.hash) return done(null, user);
            done(null, false, { message: 'Incorrect password.' });
        });
    });
}));

passport.use(new FacebookStrategy({
    clientID: "573745316055036",
    clientSecret: "74aab3bdc0694d46624cf05b81296ef6",
    callbackURL: "http://quizzapp-0831.herokuapp.com/auth/facebook/callback",
    profileFields: ['id', 'displayName', 'photos', 'email', 'languages', 'first_name']
  },
  function(accessToken, refreshToken, profile, done) {
      console.log(profile._json.first_name);
    FbUsers.findOne({fbId : profile.id}, function(err, oldUser){
        if(oldUser){
            done(null,oldUser);
        }else{
            
            var newUser = new FbUsers({
                fbId : profile.id ,
                email : profile.emails[0].value,
                name : profile._json.first_name,
                fullName : profile.displayName,
                score : 0
            }).save(function(err,newUser){
                if(err) throw err;
                done(null, newUser);
            });
        }
    });
  }
));


passport.serializeUser(function(user, done) {
    done(null, user.id);
});


passport.deserializeUser(function(id, done) {
    FbUsers.findById(id,function(err,user){
        if(err) done(err);
        if(user){
            done(null,user);
        }else{
            Users.findById(id, function(err,user){
                if(err) done(err);
                done(null,user);
            });
        }
    });
});

// Import the 'path' module (packaged with Node.js)
var path = require('path');

// Create a new instance of Express
var lessMiddleware = require('less-middleware');
var app = express();

// Import the Anagrammatix game file.
var agx = require('./game');


// Create a simple Express application
app.configure(function() {
    // Turn down the logging activity
    //app.engine('.html', require('ejs').__express);
    //app.set('view engine', 'html');
    app.set('view engine', 'jade');
    app.set('views', __dirname + '/views');
    app.use(express.logger('dev'));
    app.use(express.cookieParser());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.session({ secret: 'keyboard cat' }));
    app.use(passport.initialize());
    app.use(passport.session());

    // Serve static html, js, css, and image files from the 'public' directory
    app.use(lessMiddleware(path.join(__dirname, 'public')));
    app.use(app.router);
    app.use(express.static(path.join(__dirname,'public')));
    
    
});

//app.get(/^\/(\d+)$/, function(req, res){
//  var gID = req.params[0];
//    res.render('index', { gid: gID, user: req.user });
//});

app.get('/', function(req, res){
    res.render('index', { user: req.user});
});

app.get('/server', function(req, res){
    res.render('server', { user: req.user});
});

app.get("/auth/facebook", passport.authenticate("facebook",{ scope : "email"}));

app.get("/auth/facebook/callback",
    passport.authenticate("facebook",{ successRedirect: '/', failureRedirect: '/login'}),
    function(req,res){
        console.log(user)
        res.render("index", {user : req.user});
    }
);

app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
});

// Create a Node.js based http server on port 5000
var port = Number(process.env.PORT || 5000);
var server = require('http').createServer(app).listen(port);

// Create a Socket.IO server and attach it to the http server
var io = require('socket.io').listen(server);

// Reduce the logging output of Socket.IO
io.set('log level',1);

// Listen for Socket.IO Connections. Once connected, start the game logic.
io.sockets.on('connection', function (socket) {
    console.log('client connected');
    agx.initGame(io, socket);
});

function authenticatedOrNot(req, res, next){
    if(req.isAuthenticated()){
        next();
    }else{
        res.redirect("/login");
    }
}

function userExist(req, res, next) {
    Users.count({
        username: req.body.username
    }, function (err, count) {
        if (count === 0) {
            next();
        } else {
            // req.session.error = "User Exist"
            res.redirect("/singup");
        }
    });
}

