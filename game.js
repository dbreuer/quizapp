var io;
var gameSocket;

/**
 * This function is called by index.js to initialize a new game instance.
 *
 * @param sio The Socket.IO library
 * @param socket The socket object for the connected client.
 */
exports.initGame = function(sio, socket){
    io = sio;
    gameSocket = socket;

    // Host Events
    gameSocket.on('hostCreateNewGame', hostCreateNewGame);
    gameSocket.on('hostRoomFull', hostPrepareGame);
    gameSocket.on('hostCountdownFinished', hostStartGame);
    gameSocket.on('hostNextRound', hostNextRound);

    // Player Events
    gameSocket.on('playerJoinGame', playerJoinGame);
    gameSocket.on('playerAnswer', playerAnswer);
    gameSocket.on('playerRestart', playerRestart);
}

/* *******************************
   *                             *
   *       HOST FUNCTIONS        *
   *                             *
   ******************************* */

/**
 * The 'START' button was clicked and 'hostCreateNewGame' event occurred.
 */
function hostCreateNewGame() {
    // Create a unique Socket.IO Room
    
    //var thisGameId = ( Math.random() * 100000 ) | 0;
    var thisGameId = 1111;
    
    
    // Return the Room ID (gameId) and the socket ID (mySocketId) to the browser client
    this.emit('hostCreateNewGame', {gameId: thisGameId, mySocketId: this.id});

    // Join the Room and wait for the players
    this.join(thisGameId.toString());
    
    
};

/*
 * Two players have joined. Alert the host!
 * @param gameId The game ID / room ID
 */
function hostPrepareGame(gameId) {
    var sock = this;
    var data = {
        mySocketId : sock.id,
        gameId : gameId
    };
    console.log("All Players Present. Preparing game...");
    io.sockets.in(data.gameId).emit('beginNewGame', data);
}

/*
 * The Countdown has finished, and the game begins!
 * @param gameId The game ID / room ID
 */
function hostStartGame(gameId) {
    console.log('Game Started.');
    sendWord(0,gameId);
};

/**
 * A player answered correctly. Time for the next word.
 * @param data Sent from the client. Contains the current round and gameId (room)
 */
function hostNextRound(data) {
    if(data.round < wordPool.length ){
        // Send a new set of words back to the host and players.
        sendWord(data.round, data.gameId);
    } else {
        // If the current round exceeds the number of words, send the 'gameOver' event.
        io.sockets.in(data.gameId).emit('gameOver',data);
    }
}
/* *****************************
   *                           *
   *     PLAYER FUNCTIONS      *
   *                           *
   ***************************** */
  

/**
 * A player clicked the 'START GAME' button.
 * Attempt to connect them to the room that matches
 * the gameId entered by the player.
 * @param data Contains data entered via player's input - playerName and gameId.
 */
function playerJoinGame(data) {
    //console.log('Player ' + data.playerName + 'attempting to join game: ' + data.gameId );

    // A reference to the player's Socket.IO socket object
    var sock = this;

    // Look up the room ID in the Socket.IO manager object.
    var room = gameSocket.manager.rooms["/" + data.gameId];

    // If the room exists...
    if( room != undefined ){
        // attach the socket id to the data object.
        data.mySocketId = sock.id;

        // Join the room
        sock.join(data.gameId);

        console.log('Player ' + data.playerName + ' joining game: ' + data.gameId );

        // Emit an event notifying the clients that the player has joined the room.
        io.sockets.in(data.gameId).emit('playerJoinedRoom', data);

    } else {
        // Otherwise, send an error message back to the player.
        this.emit('error',{message: "This room does not exist."} );
    }
}

/**
 * A player has tapped a word in the word list.
 * @param data gameId
 */
function playerAnswer(data) {
     console.log('Player ID: ' + data.playerId + ' answered a question with: ' + data.answer);

    // The player's answer is attached to the data object.  \
    // Emit an event with the answer so it can be checked by the 'Host'
    
    io.sockets.in(data.gameId).emit('playerCheckAnswer', data);
}

/**
 * The game is over, and a player has clicked a button to restart the game.
 * @param data
 */
function playerRestart(data) {
    // console.log('Player: ' + data.playerName + ' ready for new game.');

    // Emit the player's data back to the clients in the game room.
    data.playerId = this.id;
    io.sockets.in(data.gameId).emit('playerJoinedRoom',data);
}

/* *************************
   *                       *
   *      GAME LOGIC       *
   *                       *
   ************************* */

/**
 * Get a word for the host, and a list of words for the player.
 *
 * @param wordPoolIndex
 * @param gameId The room identifier
 */
function sendWord(wordPoolIndex, gameId) {
    var data = getWordData(wordPoolIndex);
    io.sockets.in(data.gameId).emit('newWordData', data);
}

/**
 * This function does all the work of getting a new words from the pile
 * and organizing the data to be sent back to the clients.
 *
 * @param i The index of the wordPool.
 * @returns {{round: *, word: *, answer: *, list: Array}}
 */
function getWordData(i){
    // Randomize the order of the available words.
    // The first element in the randomized array will be displayed on the host screen.
    // The second element will be hidden in a list of decoys as the correct answer
    //var words = shuffle(wordPool[i].words);
    var words = wordPool[i].words;
    
    // Randomize the order of the decoy words and choose the first 5
    var decoys = shuffle(wordPool[i].decoys).slice(0,3);

    // Pick a random spot in the decoy list to put the correct answer
    var rnd = Math.floor(Math.random() * 4);
    
    decoys.splice(rnd, 0, words[1]);
    // Package the words into a single object.
    var wordData = {
        round: i,
        word : words[0],   // Displayed Word
        answer : words[1], // Correct Answer
        list : decoys      // Word list for player (decoys and answer)
    };

    return wordData;
}

/*
 * Javascript implementation of Fisher-Yates shuffle algorithm
 * http://stackoverflow.com/questions/2450954/how-to-randomize-a-javascript-array
 */
function shuffle(array) {
    var currentIndex = array.length;
    var temporaryValue;
    var randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

/**
 * Each element in the array provides data for a single round in the game.
 *
 * In each round, two random "words" are chosen as the host word and the correct answer.
 * Five random "decoys" are chosen to make up the list displayed to the player.
 * The correct answer is randomly inserted into the list of chosen decoys.
 *
 * @type {Array}
 */
var wordPool = [
    {
        "words"  : [ "Which of the below is not a Nicolas Cage movie?", "Fight Club" ],
        "decoys" : [ "Gone in 60 Seconds","Adaptation","Matchstick men"]
    },

    {
        "words"  : [ "What is the maximum score in a game of Snooker?", "147" ],
        "decoys" : [ "125","146","180"]
    },

    {
        "words"  : [ "“Developers, Developers, Developers...” name the CEO", "Steve Ballmer" ],
        "decoys" : [ "Tim Cook","Mark Zukerberg","Steve Jobs" ]
    }, 
    /*
    {
        "words"  : [ "What song is He-man famous for singing?", "4 Non Blondes – Whats Up" ],
        "decoys" : [ "The Bangles – Eternal Flame","Cranberries – Zombie","Miley Cyrus – Party in the USA" ]
    },
    {
        "words"  : [ "The Grand Budapest Hotel is the latest film by which director?", "Wes Anderson" ],
        "decoys" : [ "Spike Jonze","Michel Goundry","Michael Bay" ]
    },
    {
        "words"  : [ "“Oh, no! Not the Bees! Not the Bees. AHHHHHH! Oh, Ther’re in my eyes. My eyes!” Name the film", "Wicker Man" ],
        "decoys" : [ "Despicable Me 2","One Night at M’cools","Batman" ]
    },
    {
        "words"  : [ "For how much did Facebook purchase What’s App?", "19 Billion" ],
        "decoys" : [ "17 Billion","20 Billion","9 Billion " ]
    },
    {
        "words"  : [ "In car iOS is being pioneered by which car manufacturer?", "Ferrari" ],
        "decoys" : [ "Ford","Land Rover","Nissan" ]
    },
    {
        "words"  : [ "The Lean Startup was written by which author?", "Eric Ries" ],
        "decoys" : [ "Tim Brown","Simon Sinek","Malcom Gladwell" ]
    },
    {
        "words"  : [ "Doge?", "Wow" ],
        "decoys" : [ "Very yes","Such Quiz","Many answer" ]
    },
    {
        "words"  : [ "What won't Ryan Gosling eat?", "His cereal" ],
        "decoys" : [ "Peanut-butter jelly","Honey badger","All the things" ]
    },
    {
        "words"  : [ "What does Antoine Dodson want you to hide?", "Your kids and your wife" ],
        "decoys" : [ "All the things","Donald Trumps comb","The implant scars" ]
    },
    {
        "words"  : [ "What will Meatloaf never do for love?", "That" ],
        "decoys" : [ "Anything","This","All the things" ]
    },
    {
        "words"  : [ "What is diversity?", "The state of being diverse" ],
        "decoys" : [ "An old, old wooden ship","What ISN'T diversity...","Everyones favourite street dance crew" ]
    },
    {
        "words"  : [ "Who is Brian, from Family Guy, in love with?", "Lois" ],
        "decoys" : [ "Meg","Herbert","All the people" ]
    },
    {
        "words"  : [ "Zach Galifianakis hosts a talk show between what?", "Some ferns" ],
        "decoys" : [ "Brunch and afternoon tea","His other projects","All the things" ]
    },
    {
        "words"  : [ "In Yann Martel's 'Life of Pi', what is the name of the tiger with with whom Pi is stranded?", "Richard Parker" ],
        "decoys" : [ "Tiggy-poo","Billy Roshan","Batman" ]
    },
    {
        "words"  : [ "Which company's marketing department tweeted their mass 'XFactor' firing?", "HMV" ],
        "decoys" : [ "United Airlines","Whole Foods","BMW" ]
    },
    {
        "words"  : [ "Which animal represents Mac OS X 10.7?", "Lion" ],
        "decoys" : [ "Mountain Lion","Snow Leopard","Nyan Cat" ]
    },
    {
        "words"  : [ "Which game development company made 'DrawSomething'?", "OMGPop" ],
        "decoys" : [ "Zynga","Epic Games","Nintendo" ]
    },
    {
        "words"  : [ "kerdes", "valasz" ],
        "decoys" : [ "valsz1","valasz2","valasz3" ]
    },
    */
]