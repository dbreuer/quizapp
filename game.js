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
    }
    
    
]
//
//Doctor
//
//1.	Dr Christiaan Barnard performed the first human heart transplant in which country?
//South Africa
//2.	Which doctor, turned author wrote Jurassic Park and The Andromeda Strain?
//Michael Crichton.
//3.	Dr Josef Mengele was known by what nickname?
//The Angel of Death (Nazi experimentation).
//4.	What was the first name of paediatrician Dr Spock?
//Benjamin
//5.	Francoise Duvalier was president of Haiti 1957-1971. By what nickname was he better known?
//Papa Doc
//6.	Sir Arthur Conan Doyle was a physician and author who studied medicine at a university in which city?
//Edinburgh.
//7.	Of the four labour politicians who set up the Social Democratic Party in 1981, which one was a doctor?
//Dr David Owen. (with Shirley Williams, Roy Jenkins & Bill Rodgers)
//8.	Which BAFTA award winning comedian and presenter is still a registered GP.
//Harry Hill.
//9.	Dr Hastings Banda was president, prime minister and dictator of which African country for 30 years?
//Malawi.
//10.	Dr Henry Heimlich (credited with inventing the Heimlich manoeuvre), was born, and still lives, in which country?
//USA
//
//Science and nature
//Which Apollo moon mission was the first to carry a lunar rover vehicle?
//Apollo 15
//The scientific unit LUMEN is used in the measurement of what?
//Light
//Which organ of the body is affected by Bright's Disease?
//Kidney
//What is the boiling point of water using the scientific kelvin scale of temperature measurement
//373k - kelvins
//What is the lightest metal under standard conditions?
//Lithium
//How many surfaces does a Mobius strip have?
//One
//How many wings does a bee have?
//Four
//What is the collective noun for a group of moles?
//A labour
//Which breed of dog has breeds called Welsh, Scottish and Irish?
//Terrier
//What is the common name for the medical condition epistaxis?
//Nose bleed
//How is the chaparral cock, a ground cuckoo native of Mexico, better known?
//The Roadrunner
//What sort of creature is a cassowary?
//A (flightless) bird
//What is made using soda, lime and silica?
//Glass
//Who created Wikipedia on the World Wide Web?
//Jimmy Wales
//Common, Water and Pygmy are types of which British mammal?
//Shrew
//Where in the human body would you find the Islets of Langerhans?
//The pancreas
//What is the only bone in the human body that is not attached to any other bone?
//The hyoid
//What mineral has the lowest number on the Mohs scale?
//Talc
//What mineral has the highest number on the Mohs scale?
//Diamond
//What is the more common name for the medical condition of periorbital hematoma?
//Black eye
//What is the common name for the liquid secreted by your lacrimal glands?
//Tears
//Who discovered the element Oxygen?
//Joseph Priestley
//What is the collective name for a group of sea cucumbers?
//A pickle
//Where in the body would you find an astrocyte?
//The brain
//What is measured on the Mohs scale?
//The hardness of minerals
//What are Grey Dagger, Forester and Dingy Footman species of?
//Moths
//Which type of animals find their way home using magnetism?
//Molluscs
//What was the name of Yuri Gagarin`s space ship?
//Vostok 1
//The word HENNA can be made using the periodic symbols of which three elements?
//(He) Helium (N) Nitrogen (Na) Sodium
//What is the more common name for the type of bear called the Ursus Maritimus?
//Polar bear
//What is the hardest natural substance?
//diamond
//Nephrology is the study of which internal organ?
//The kidney
//Where on a horse do you find its poll?
//Between the ears
//What does MRSA stand for?
//Methicillin Resistant Staphyloccocus Aureus
//Which spider gets its name from when the female sometimes eats the male after mating?
//Black Widow Spider
//What is ylang-ylang - a herb or a flower?
//Flower
//Where in the human body would you find Island of Reils?
//The brain
//What is the hardest natural substance?
//Diamond
//What is the process called in which birds lose their feathers?
//Moulting
//What is the only bird that is capable of seeing the colour blue?
//The owl
//What is the only animal that cannot jump?
//Elephant
//From the Sun, what is the name of the nearest star?
//Proxima Centauri
//In computing what does the abbreviation U.S.B. stand for?
//Universal Serial Bus
//What does the information technology term RAM stand for?
//Random Access Memory
//What is the chemical symbol for Arsenic?
//As
//What is the largest internal human organ?
//The liver
//Used in satellite navigation, what do the initials in the term GPS stand for?
//Global Positioning System
//What is the main effect of vitamin K deficiency?
//Bleeding
//Little, Eurasian Eagle and Burrowing are all types of which species of bird?
//Owl
//What is the lightest chemical element?
//Hydrogen
//What is the collective term for a group of racoons?
//A nursery
//What is the collective term for a group of racehorses?
//A string of racehorses
//To the nearest whole number, what percentage of the Earth's atmosphere is nitrogen?
//78%
//In the world of the internet, what do the letters HTTP stand for?
//Hyper Text Transfer Protocol
//What gas do all fuels need in order to burn?
//Oxygen
//By what name is the Sodium Chloride more commonly known?
//Salt
//Sand consists of silicon and what other element?
//Oxygen
//What is the brightest star in the northern hemisphere?
//Sirius
//Common, Arctic and Sooty are all varieties of which type of bird?
//Tern
//Worcester Black, Arlington Pippin and Bartlett are all varieties of which type of fruit?
//Pear
//Where in the human body would you find the scaphoid bone?
//In the wrist
//The does the chemical symbol Pb stand for?
//Lead
//How many stomachs does a cow have?
//Four
//Which bird lays the biggest egg in the world?
//The ostrich
//What is the name of the pouch in which marsupials carry their young?
//The marsupium
//What African animal kills the most people?
//The Crocodile
//Which bird can run the fastest?
//Ostrich
//What is the layer of the atmosphere closest to the earth`s surface called?
//The Troposphere
//What nuclear process takes place in an atomic bomb?
//Fission
//What is the only native North American marsupial?
//The Opossum
//Which leaves form the diet of the silkworm?
//Mulberry
//True or False: Sharks do not blink?
//True
//True or False: All polar bears are left-handed?
//True
//What is the condition of Nitrogen Embolism more commonly known as?
//The bends
//What is the more common name for the scapula?
//The shoulder blade
//Who invented a vaccination for smallpox?
//Edward Jenner
//An orchidectomy is the surgical removal of what?
//Testicles
//What does LASER stand for?
//Light Amplification by Stimulated Emission of Radiation
//What does `http` stand for, as used in website addresses?
//Hyper Text Transfer Protocol
//What name is given to a cow that has not had a calf?
//A Heifer
//
//Brother in Arm
//What was the name of the brothers who made the first powered airplane flight in 1903?
//Orville & Wilber Wright.
//2.	What was the name of the brothers who wrote, amongst others, the popular fairy tales, ‘Sleeping B eauty’, ‘Cinderella’ and ‘Snow White?
//Wilhelm & Jacob Grimm.
//3.	What were the names of the four Marx brothers?
//Groucho, Harpo, Chico, & Zeppo.
//4.	What were the real names of the Righteous Brothers?
//Bill Medley & Bobby Hatfield.
//5.	Who is missing from this list of acting brothers, Paul, Stephen, Joe and who?
//Mark(McGann)
//6.	Clemens and August Brenninkmieler founded which fashion store in 1841?
//C&A.(The initials of their christian names).
//7.	What is the name of the brothers who formed the band Spandau Ballet, then went on to portray the Kray twins in the film ‘The Krays’?
//Gary & Martin Kemp.
//8.	Which company was founded by Rudi Dassler in direct competition to Addidas, the company founded by his brother Adolf Dassler?
//Puma.
//9.	What are the names of the brothers known for producing and directing films such as ‘The Big Leowski, & ‘No Country for Old Men?
//Joel & Ethen Cohen
//10.	What are the names of the brothers who have won Olympic, World, and Commonwealth competitions in the triathlon?
//Alistair & Jonny Brownlee.
//
//PUB quizz
//In 2006 there were approximately how many pubs in the UK? 47,500, 57,500 or 67,500?
//57,500
//2.	What is the second most common pub name in the UK behind the Red Lion?
//The Royal Oak
//3.	Amos Brierly and Mr Wilks ran which pub on TV?
//The Woolpack (in Emmerdale)
//4.	What is the claim to fame of the pub called the Nutshell in Bury St. Edmunds?
//It is the smallest pub in Britain
//5.	Famous for its double glazing advert in the 1970s, what is the claim to fame of the Tan Hill Inn in Yorkshire?
//It is the highest pub in Britain
//6.	The pub with the longest name in the UK has how many letters in it? 55, 75 or 95?
//55 (The Old Thirteenth Cheshire Astley Volunteer Rifleman Corps Inn)
//7.	With only one letter in its name. What is the name of the pub with the shortest name?
//Q (in Stalybridge)
//8.	What is the name of the brewery that supplies the beer to the Rovers Return in Coronation Street?
//Newton and Ridley
//9.	The Bottle Inn at Marshwood in Dorset has what annual eye watering and tongue numbing item on the menu?
//Nettles (it’s home to the national annual nettle-eating competition)
//10.	What was the name of the pub that mysteriously burnt down in Eastenders?
//The Dagmart