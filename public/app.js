;
jQuery(function($){    
    'use strict';
    
    var body = $("html, body");
    body.animate({scrollTop: 100}, '500');
    /**
     * All the code relevant to Socket.IO is collected in the IO namespace.
     *
     * @type {{init: Function, bindEvents: Function, onConnected: Function, onNewGameCreated: Function, playerJoinedRoom: Function, beginNewGame: Function, onNewWordData: Function, hostCheckAnswer: Function, gameOver: Function, error: Function}}
     */
    var IO = {

        /**
         * This is called when the page is displayed. It connects the Socket.IO client
         * to the Socket.IO server
         */
        init: function() {
            IO.socket = io.connect();
            IO.bindEvents();
            
        },

        /**
         * While connected, Socket.IO will listen to the following events emitted
         * by the Socket.IO server, then run the appropriate function.
         */
        bindEvents : function() {
            IO.socket.on('hostCreateNewGame', IO.onNewGameCreated );
            IO.socket.on('playerJoinedRoom', IO.playerJoinedRoom );
            IO.socket.on('beginNewGame', IO.beginNewGame );
            IO.socket.on('newWordData', IO.onNewWordData);
            IO.socket.on('playerCheckAnswer', IO.playerCheckAnswer);
            IO.socket.on('gameOver', IO.gameOver);
            IO.socket.on('error', IO.error );
        },


        /**
         * A new game has been created and a random game ID has been generated.
         * @param data {{ gameId: int, mySocketId: * }}
         */
        onNewGameCreated : function(data) {
            App.mySocketId = IO.socket.socket.sessionid;
            App.Host.gameInit(data);
        },
        
        
        /**
         * A player has successfully joined the game.
         * @param data {{playerName: string, gameId: int, mySocketId: int}}
         */
        playerJoinedRoom : function(data) {
            // When a player joins a room, do the updateWaitingScreen funciton.
            // There are two versions of this function: one for the 'host' and
            // another for the 'player'.
            //
            // So on the 'host' browser window, the App.Host.updateWiatingScreen function is called.
            // And on the player's browser, App.Player.updateWaitingScreen is called.
            App[App.myRole].updateWaitingScreen(data);
        },

        /**
         * Both players have joined the game.
         * @param data
         */
        beginNewGame : function(data) {
            App[App.myRole].gameCountdown(data);
        },

        /**
         * A new set of words for the round is returned from the server.
         * @param data
         */
        onNewWordData : function(data) {
            // Update the current round
            App.currentRound = data.round;

            // Change the word for the Host and Player
            App[App.myRole].newWord(data);
        },

        /**
         * A player answered. If this is the host, check the answer.
         * @param data
         */
        playerCheckAnswer : function(data) {
                
                App.Player.checkAnswer(data);
        },

        /**
         * Let everyone know the game has ended.
         * @param data
         */
        gameOver : function(data) {
            App[App.myRole].endGame(data);
        },

        /**
         * An error has occurred.
         * @param data
         */
        error : function(data) {
            alert(data.message);
        }

    };

    var App = {

        /**
         * Keep track of the gameId, which is identical to the ID
         * of the Socket.IO Room used for the players and host to communicate
         *
         */
        gameId: 0,

        /**
         * This is used to differentiate between 'Host' and 'Player' browsers.
         */
        myRole: '',   // 'Player' or 'Host'

        /**
         * The Socket.IO socket object identifier. This is unique for
         * each player and host. It is generated when the browser initially
         * connects to the server when the page loads for the first time.
         */
        mySocketId: '',

        /**
         * Identifies the current round. Starts at 0 because it corresponds
         * to the array of word data stored on the server.
         */
        currentRound: 0,
        /**
         * Identifies the current round. Starts at 0 because it corresponds
         * to the array of word data stored on the server.
         */
        allowedPlayersInRoom: 3,

        /* *************************************
         *                Setup                *
         * *********************************** */

        /**
         * This runs when the page initially loads.
         */
        init: function () {
            App.cacheElements();
            App.showInitScreen();
            App.bindEvents();

            // Initialize the fastclick library
            //FastClick.attach(document.body);
        },

        /**
         * Create references to on-screen elements used throughout the game.
         */
        cacheElements: function () {
            App.$doc = $(document);

            // Templates
            App.$gameArea = $('#gameArea');
            App.$templateIntroScreen = $('#intro-screen-template').html();
            App.$templateNewGame = $('#create-game-template').html();
            App.$templateJoinGame = $('#join-game-template').html();
            App.$hostGame = $('#host-game-template').html();
            App.$leaderboradGame = $('#leaderboard-template').html();
        },

        /**
         * Create some click handlers for the various buttons that appear on-screen.
         */
        bindEvents: function () {
            // Host

            // Player
//            App.$doc.on('click', '#btnLoginGame', App.Player.onLoginClick);
            App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
            App.$doc.on('click', '#btnStart',App.Player.onPlayerStartClick);
            App.$doc.on('click', '.btnAnswer',App.Player.onPlayerAnswerClick);
            App.$doc.on('click', '#btnPlayerRestart', App.Player.onPlayerRestart);
        },

        /* *************************************
         *             Game Logic              *
         * *********************************** */

        /**
         * Show the initial QuizzApp Title Screen
         * (with Start and Join buttons)
         */
        showInitScreen: function() {
            App.$gameArea.html(App.$templateIntroScreen);
            IO.socket.emit('hostCreateNewGame');
            //App.doTextFit($('#facebookLoginBtn'))
        },


        /* *******************************
           *         HOST CODE           *
           ******************************* */
        Host : {

            /**
             * Contains references to player data
             */
            players : [],

            /**
             * Flag to indicate if a new game is starting.
             * This is used after the first game ends, and players initiate a new game
             * without refreshing the browser windows.
             */
            isNewGame : false,

            /**
             * Keep track of the number of players that have joined the game.
             */
            numPlayersInRoom: 0,

            /**
             * A reference to the correct answer for the current round.
             */
            currentCorrectAnswer: '',


            /**
             * The Host screen is displayed for the first time.
             * @param data{{ gameId: int, mySocketId: * }}
             */
            gameInit: function (data) {
                App.gameId = data.gameId;
                App.mySocketId = data.mySocketId;
                App.myRole = 'Host';
                App.Host.numPlayersInRoom = 0;
                
                App.Host.displayNewGameScreen();
                console.log("Game started with ID: " + App.gameId + ' by host: ' + App.mySocketId);
            },

            /**
             * Show the Host screen containing the game URL and unique game ID
             */
            displayNewGameScreen : function() {
                // Fill the game screen with the appropriate HTML
                App.$gameArea.html(App.$hostGame);
                
                $('#gameURL').html("<img src='https://api.qrserver.com/v1/create-qr-code/?size=150x150&data="+window.location.href+"'/>");
                //App.doTextFit('#gameURL');
                
                // Show the gameId / room id on screen
                $('#spanNewGameCode').text(App.gameId);
            },

            /**
             * Update the Host screen when the first player joins
             * @param data{{playerName: string}}
             */
            updateWaitingScreen: function(data) {
                // If this is a restarted game, show the screen.
                if ( App.Host.isNewGame ) {
                    App.Host.displayNewGameScreen();
                }
                // Update host screen
                //$('#playersWaiting')
                  //  .append('<p>Player ' + data.playerName + ' joined the game.</p>');
                
                
                $('#playerScores')
                        .append( $('<div/>').addClass('playerScore').attr('id', 'player'+(App.Host.numPlayersInRoom+1)+'Score')
                        .append( $('<span/>').addClass('playerName').text(data.playerName))
                        .append( $('<span/>').addClass('score').text('0').attr('id', data.mySocketId)));
                //$('#player2Score').find('.score').attr('id',App.Host.players[1].mySocketId);
                //<div id="player1Score" class="playerScore">
                //<span class="score">0</span><span class="playerName">Player 1</span>
                //</div>
                // Store the new player's data on the Host.
                App.Host.players.push(data);

                // Increment the number of players in the room
                App.Host.numPlayersInRoom += 1;

                // If two players have joined, start the game!
                if (App.Host.numPlayersInRoom === App.allowedPlayersInRoom) {
                    // console.log('Room is full. Almost ready!');

                    // Let the server know that two players are present.
                    IO.socket.emit('hostRoomFull',App.gameId);
                }
            },

            /**
             * Show the countdown screen
             */
            gameCountdown : function() {

                // Prepare the game screen with new HTML
                App.$gameArea.html(App.$hostGame);
                $('#wordArea').html( $('<div/>').text('5').attr('id', 'hostWord'));
                //App.doTextFit('#hostWord');
                
                // Begin the on-screen countdown timer
                var $secondsLeft = $('#hostWord');
                App.countDown( $secondsLeft, 5, function(){
                    IO.socket.emit('hostCountdownFinished', App.gameId);
                });

                // Display the players' names on screen
                
                // Set the Score section on screen to 0 for each player.
                for (var item in App.Host.players) {
                    $('#playerScores')
                        .append( $('<div/>').addClass('playerScore').attr('id', 'player'+(item+1)+'Score')
                        .append( $('<span/>').addClass('playerName').text(App.Host.players[item].playerName))
                        .append( $('<span/>').addClass('score').text('0').attr('id', App.Host.players[item].mySocketId)));
                }
            },
            


            /**
             * Show the word for the current round on screen.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newWord : function(data) {
                // Insert the new word into the DOM
                $('#hostWord').html(data.word);
                App.doTextFit('#hostWord');
                
                console.log('newWord', data);
                // Update the data for the current round
                App.Host.currentCorrectAnswer = data.answer;
                App.Host.currentRound = data.round;
            },

            


            /**
             * All 10 rounds have played out. End the game.
             * @param data
             */
            endGame : function(data) {
                // Get the data for player 1 from the host screen
                var $p1 = $('#player1Score');
                var p1Score = +$p1.find('.score').text();
                var p1Name = $p1.find('.playerName').text();

                // Get the data for player 2 from the host screen
                var $p2 = $('#player2Score');
                var p2Score = +$p2.find('.score').text();
                var p2Name = $p2.find('.playerName').text();

                // Find the winner based on the scores
                var winner = (p1Score < p2Score) ? p2Name : p1Name;
                var tie = (p1Score === p2Score);

                // Display the winner (or tie game message)
                if(tie){
                    $('#hostWord').text("It's a Tie!");
                } else {
                    $('#hostWord').text( winner + ' Wins!!' );
                }
                //App.doTextFit('#hostWord');

                // Reset game data
                App.Host.numPlayersInRoom = 0;
                App.Host.isNewGame = true;
            },

            /**
             * A player hit the 'Start Again' button after the end of a game.
             */
            restartGame : function() {
                App.$gameArea.html(App.$templateNewGame);
                $('#spanNewGameCode').text(App.gameId);
            }
        },


        /* *****************************
           *        PLAYER CODE        *
           ***************************** */

        Player : {

            /**
             * A reference to the socket ID of the Host
             */
            hostSocketId: '',

            /**
             * The player's name entered on the 'Join' screen.
             */
            myName: '',
            
            
            /**
             * Click handler for the 'JOIN' button
             */
            onJoinClick: function () {
                // console.log('Clicked "Join A Game"');

                // Display the Join Game HTML on the player's screen.
                App.$gameArea.html(App.$templateJoinGame);
                
                $('.header').animate({height: '40px', opacity: 1});
                $('.header > span').animate({left: '50%'});
                $('.header > div').animate({opacity: 1});
            },

            /**
             * The player entered their name and gameId (hopefully)
             * and clicked Start.
             */
            onPlayerStartClick: function() {
                // console.log('Player clicked "Start"');

                // collect data to send to the server
                var data = {
                    gameId : App.gameId,
                    playerName : $('#inputPlayerName').val() || 'anon',
                    fbId : $('#inputPlayerfbId').val(),
                    picURL : $('#profilePic').attr('src'),
                    score : 0
                };
                
                // Send the gameId and playerName to the server
                IO.socket.emit('playerJoinGame', data);

                // Set the appropriate properties for the current player.
                App.myRole = 'Player';
                App.Player.myName = data.playerName;
            },

            /**
             *  Click handler for the Player hitting a word in the word list.
             */
            onPlayerAnswerClick: function() {
                // console.log('Clicked Answer Button');
                var $btn = $(this);      // the tapped button
                var answer = $btn.val(); // The tapped word

                // Send the player info and tapped word to the server so
                // the host can check the answer.
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    answer: answer,
                    round: App.currentRound
                }
                IO.socket.emit('playerAnswer',data);
            },
            
            /**
             * Check the answer clicked by a player.
             * @param data{{round: *, playerId: *, answer: *, gameId: *}}
             */
            checkAnswer : function(data) {
                // Verify that the answer clicked is from the current round.
                // This prevents a 'late entry' from a player whos screen has not
                // yet updated to the current round.
                
                
                var currentPlayerIndex = 0;
                
                if (data.round === App.currentRound){
                    
                    
                    
                    for(var item in App.Host.players) {
                        
                        
                        
                        if (App.Host.players[item] && App.Host.players[item].mySocketId === data.playerId) {
                            currentPlayerIndex = item;
                            
                        }
                    }
                    
                    console.log(App.Host.players[currentPlayerIndex].mySocketId, App.Host.players[currentPlayerIndex].score);
                    console.log('appkerdes', App.Host.currentCorrectAnswer);
                    console.log('datakerdes', data.answer);
                    
                            if( App.Host.currentCorrectAnswer === data.answer ) {
                                
                                
                                
                                App.Host.players[currentPlayerIndex].score = App.Host.players[currentPlayerIndex].score + 5;
                                
                                App.currentRound += 1;
                                
                                var data = {
                                    gameId : App.gameId,
                                    round : App.currentRound,
                                    players : App.Host.players
                                };
                                
                                IO.socket.emit('hostNextRound',data);
                            } else {
                                if (App.Host.players[currentPlayerIndex].score > 0) {
                                    
                                    App.Host.players[currentPlayerIndex].score = App.Host.players[currentPlayerIndex].score - 3;
                                    
                                }
                                
                            }
                      
//                    // Get the player's score
//                    var $pScore = $('#' + data.playerId);
//
//                    // Advance player's score if it is correct
//                    if( App.Host.currentCorrectAnswer === data.answer ) {
//                        // Add 5 to the player's score
//                        $pScore.text( +$pScore.text() + 5 );
//
//                        // Advance the round
//                        App.currentRound += 1;
//
//                        // Prepare data to send to the server
//                        var data = {
//                            gameId : App.gameId,
//                            round : App.currentRound
//                        }
//
//                        // Notify the server to start the next round.
//                        IO.socket.emit('hostNextRound',data);
//
//                    } else {
//                        // A wrong answer was submitted, so decrement the player's score.
//                        $pScore.text( +$pScore.text() - 3 );
//                    }
                }
            },
            
            /**
             *  Click handler for the "Start Again" button that appears
             *  when a game is over.
             */
            onPlayerRestart : function() {
                var data = {
                    gameId : App.gameId,
                    playerName : App.Player.myName,
                    score : 0
                }
                IO.socket.emit('playerRestart',data);
                App.currentRound = 0;
                $('#gameArea').html("<h3>Waiting on host to start new game.</h3>");
            },

            /**
             * Display the waiting screen for player 1
             * @param data
             */
            updateWaitingScreen : function(data) {
                App.Host.players.push(data);

                // Increment the number of players in the room
                App.Host.numPlayersInRoom += 1;

                // If two players have joined, start the game!
                if (App.Host.numPlayersInRoom === App.allowedPlayersInRoom) {
                    // console.log('Room is full. Almost ready!');
                    
                    // Let the server know that two players are present.
                    IO.socket.emit('hostRoomFull',App.gameId);
                    
                }
                
                
                for (var i in App.Host.players) {
                    console.log(App.Host.players[i]);
                    var $this =$('#playerWaitingMessage').find(".empty:eq("+i+")");
                    $this.html( '' );
                    $this.append( $('<div/>').addClass('circular small').append( $('<img/>').attr('src', App.Host.players[i].picURL) ));
                    $this.append( $('<h4/>').addClass('white').text(App.Host.players[i].playerName) );
                }
                
                
                
                if(IO.socket.socket.sessionid === data.mySocketId){
                    App.myRole = 'Player';
                    App.gameId = data.gameId;
                    
                    $("#inputPlayerName, #btnStart").addClass('hidden');
                    $('#playerWaitingMessage').parent().prepend( $('<h5/>').html('Waiting for players... <i class="fa fa-spinner fa-spin"></i>') )
                    $('#playerWaitingMessage').removeClass('hidden');
                    
                }
            },

            /**
             * Display 'Get Ready' while the countdown timer ticks down.
             * @param hostData
             */
            gameCountdown : function(hostData) {
                App.Player.hostSocketId = hostData.mySocketId;
                $('#gameArea')
                    .html('<div class="gameOver">Get Ready!</div>');
                    $('#gameArea').append($("<div/>").attr('id', 'hostWord').html('<span class="fa-stack fa-5x"><i class="fa fa-circle-o-notch fa-spin fa-stack-2x"></i><span><span></span>'));
                var $secondsLeft = $('#hostWord > span > span');
                App.countDown( $secondsLeft, 5, function(){
                    IO.socket.emit('hostCountdownFinished', App.gameId);
                });
                
            },

            /**
             * Show the list of words for the current round.
             * @param data{{round: *, word: *, answer: *, list: Array}}
             */
            newWord : function(data) {
                // Create an unordered list element
                var $list = $('<ul/>').attr('id','ulAnswers');
                
                console.log('newWord', data);
                // Update the data for the current round
                App.Host.currentCorrectAnswer = data.answer;
                App.Host.currentRound = data.round;
                
                // Insert a list item for each word in the word list
                // received from the server.
                var aN = 0;
                $.each(data.list, function(){
                    var abc = ["A", "B", "C", "D"];
                    $list                                //  <ul> </ul>
                        .append( $('<li/>')              //  <ul> <li> </li> </ul>
                            .append( $('<button/>')      //  <ul> <li> <button> </button> </li> </ul>
                                .addClass('btnAnswer')   //  <ul> <li> <button class='btnAnswer'> </button> </li> </ul>
                                .addClass('btn')         //  <ul> <li> <button class='btnAnswer'> </button> </li> </ul>
                                .val(this)               //  <ul> <li> <button class='btnAnswer' value='word'> </button> </li> </ul>
                                .html("<div>"+abc[aN]+"</div>"+this)              //  <ul> <li> <button class='btnAnswer' value='word'>word</button> </li> </ul>
                            )
                        )
                    aN++;
                });
                
                

                // Insert the list onto the screen.
                $('#gameArea').html($list);
                $('#gameArea').prepend($('<div/>').addClass('question-box').append( $('<h3/>').text(data.word)));
            },

            /**
             * Show the "Game Over" screen.
             */
            endGame : function(data) {
                App.$gameArea.html(App.$leaderboradGame);
                console.log(data);
                for(var item in data.players) {
                    $('table > tbody')
                    .append(
                        // Create a button to start a new game.
                        $('<tr/>')
                                .append(
                                    $('<td/>').text((parseInt(item)+1) + 'st')
                                )
                                .append(
                                    $('<td/>').append($('<img/>').attr('src', data.players[item].pic))
                                )
                                .append(
                                    $('<td/>').text(data.players[item].playerName)
                                )
                                .append(
                                    $('<td/>').text(data.players[item].score)
                                )
                    );
                }
                
            }
        },


        /* **************************
                  UTILITY CODE
           ************************** */

        /**
         * Display the countdown timer on the Host screen
         *
         * @param $el The container element for the countdown timer
         * @param startTime
         * @param callback The function to call when the timer ends.
         */
        countDown : function( $el, startTime, callback) {

            // Display the starting time on the screen.
            $el.text(startTime);
            //App.doTextFit('#hostWord');

            // console.log('Starting Countdown...');

            // Start a 1 second timer
            var timer = setInterval(countItDown,1000);

            // Decrement the displayed timer value on each 'tick'
            function countItDown(){
                startTime -= 1
                $el.text(startTime);
                //App.doTextFit('#hostWord');

                if( startTime <= 0 ){
                    // console.log('Countdown Finished.');

                    // Stop the timer and do the callback.
                    clearInterval(timer);
                    callback();
                    return;
                }
            }

        },


    };

    IO.init();
    App.init();
    
    
}($));

function BlockMove(event) {
  // Tell Safari not to move the window.
  event.preventDefault() ;
 }



function refreshWindow() {
        location.reload();
    }