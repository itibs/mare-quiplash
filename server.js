const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    // Configure Socket.IO for better performance with many connections
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
    allowEIO3: true,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

const port = process.env.PORT || 3000;

const SPEEDUP = 1;

// Config
let nrRounds = 2;

// Game state
let players = [];
let disconnectedPlayers = [];  // Track disconnected players
let questions = [];
let answers = [];
let votingPhase = false;
let crtRound = 0;
let nextQuestionToVote = 0;
let cntVotes = 0;
let votingTimer = null;  // Timer for voting phases

// Game constants
const INITIAL_PROMPTS = [
    'Lângă Timmy în tren se așează un bombardier cu cruce la gât. Timmy: "Salut! ..."',
    'Bucuria nu s-a putut ascunde pe fața lui Adiel când au adus la masa de prânz ...',
    'Hermano Narcis întreabă cine de la noi vrea să se întoarcă acum cu ei în Mexic. Îi răspunde Philip zâmbind: "..."',
    'Brother Emi: "voiam cu tot dinadinsul să vorbim despre apologetică acum, dar în schimb m-am văzut silit să vă îndemn..."',
    'Metoda preferată a lui Paty de evanghelizare este...',
    'Simona caută în grabă rețete de ciorbe. Liviu: "..."',
    'Doamna-polițist "că, na, sigur mergeți și voi la petreceri, bairamuri, serate.." Intervine Dana: "...!"',
    'Spre uimirea tuturor, ... vine într-o zi la Panduri și se pocăiește spunând că a primit un tractat cu mulți ani în urmă de la un băiat pe nume Tibi.',
    'Aventura-Park-Guy: "Totul clar?" Ready to go?" David: "O întrebare! Ce se întâmplă oare dacă...?"',
    'Colegele la facultate: "Dar tu ești pocăită?" Alysa:"..."',
    'Într-o marți cu soare, Dantes aduce la tineret o prăjitură nemaiîntâlnită care zice că se numește...',
    'Dintotdeauna, secretul de memorare al lui Horia a fost să asculte pe fundal...',
    'Cea mai atipică întrebare pe care Andreea B. a primit-o din partea unui copilaș a fost: "..."',
    'Versetul preferat al Anisiei I. din toată Biblia este tocmai: ...',
    'Dacă Moni nu s-ar fi apucat niciodată să învețe pian, acum ar fi fost expertă în ...',
    'Anita a uitat să-și ia în tabără cel mai important lucru, ...',
    'Ce îi place lui Beni cel mai mult la tinerii din Panduri este că ...',
    'Titlul cel mai intrigant de poveste pe care a conceput-o Andreea M. pentru copii: ...',
    'Dacă n-ar fi existat Camera de Sus, acum Marilena ...',
    'Momentul preferat al Sarei din toată tabăra a fost când ...',
    'În prima zi de facultate, Abi a descoperit că ...',
    'Mare a fost uimirea lui Naomi când a venit în București și faptul că oamenii ...',
    'Vecinii: "Dar ce e cu toți oamenii ăștia care vă construiesc casa?". Răspunde Andrei, copil fiind: "..."',
    'Motivul adevărat pentru care Anisia S. studiază suedeza este ...',
    'Un bezmetic îi taie calea în trafic lui B 253 GAB. Ce-i răspunde Gabi: "...".',
    'Cântarea care ajunge întotdeauna la sufletul Anei este: ...',
    'Liviu: "eu am plecat la fotbal cu băieții". Simona:"..."',
    'Brother Sergiu: "Și pentru ce ai nevoie de scrisoare de recomandare la Jubilate?" Claudia: "Păi..."',
    'Povața pe care Lidia le-a dat-o întotdeauna fetelor ei: "..."'
];

const States = {
    PREGAME: 'PREGAME',
    ANSWERING: 'ANSWERING',
    VOTING: 'VOTING',
    VOTING_RESULTS: 'VOTING_RESULTS',
    ROUND_RESULTS: 'ROUND_RESULTS',
    FINISHED: 'FINISHED',
}

let crtPrompts = INITIAL_PROMPTS;
let gameState = States.PREGAME;
let isEndingRound = false;

// Connection monitoring
let totalConnections = 0;
let peakConnections = 0;
let connectionStats = {
    connects: 0,
    disconnects: 0,
    joins: 0,
    errors: 0
};

app.get('/styles.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'player.html'));
});

app.get('/master/', (req, res) => {
    res.sendFile(path.join(__dirname, 'master.html'));
});

app.get('/config/', (req, res) => {
    res.sendFile(path.join(__dirname, 'config.html'));
});

app.get('/version/', (req, res) => {
    res.send("v1.1");
});

app.get('/debug/', (req, res) => {
    res.json({
        gameState: gameState,
        players: players.length,
        disconnectedPlayers: disconnectedPlayers.length,
        totalConnections: totalConnections,
        questions: questions.length > 0 ? questions[crtRound]?.length || 0 : 0,
        answers: answers.length,
        currentRound: crtRound,
        nextQuestionToVote: nextQuestionToVote,
        cntVotes: cntVotes,
        playerList: players.map(p => ({ name: p.name, id: p.id, score: p.score })),
        answersDetail: answers.map(a => ({ player: a.playerName, prompt: a.prompt.substring(0, 50) + '...', answer: a.text, votes: a.votes }))
    });
});


io.on('connection', (socket) => {
    totalConnections++;
    connectionStats.connects++;
    peakConnections = Math.max(peakConnections, totalConnections);
    
    // Initialize voting flag
    socket.hasVotedThisQuestion = false;
    
    console.log(`👤 User connected: ${socket.id} (Total: ${totalConnections}, Peak: ${peakConnections})`);

    socket.on('resetAll', () => {
        gameState = States.PREGAME;
        players = [];
        disconnectedPlayers = [];
        questions = [];
        answers = [];
        votingPhase = false;
        crtRound = 0;
        nextQuestionToVote = 0;
        cntVotes = 0;
        isEndingRound = false;
        if (votingTimer) {
            clearTimeout(votingTimer);
            votingTimer = null;
        }
        console.log('Game reset - all players and state cleared');
    });

    socket.on('getPlayerList', () => {
        console.log(`📋 Player list requested by ${socket.id}, sending ${players.length} players`);
        io.emit('playerList', players);
    })



    socket.on('getCurrentGameState', () => {
        console.log(`📊 Game state requested by ${socket.id}, current state: ${gameState}`);
        emitGameState();
    });

    socket.on('receiveState', () => {
        setInterval(() => {
            socket.emit('state_dump', {
                players,
                questions,
                answers,
                votingPhase,
                crtRound,
                nextQuestionToVote,
                cntVotes,
            })
        }, 5000);
    })

    socket.on('newPrompts', (prompts) => {
        crtPrompts = prompts;
    });

    // Handle player disconnection
    socket.on('disconnect', (reason) => {
        totalConnections--;
        connectionStats.disconnects++;
        console.log(`👋 Player disconnected: ${socket.id} (Reason: ${reason}, Total: ${totalConnections})`);
        const playerIndex = players.findIndex(player => player.id === socket.id);
        
        if (playerIndex !== -1) {
            const disconnectedPlayer = players[playerIndex];
            
            if (gameState === States.PREGAME) {
                // During pregame, remove player completely
                players.splice(playerIndex, 1);
                io.emit('playerList', players);
            } else {
                // During active game, move to disconnected list but keep their data
                disconnectedPlayers.push({
                    ...disconnectedPlayer,
                    disconnectedAt: Date.now()
                });
                
                // Remove from active players list
                players.splice(playerIndex, 1);
                console.log(`Player ${disconnectedPlayer.name} disconnected during game, moved to disconnected list (${players.length} active players remaining)`);
                io.emit('playerList', players); // Broadcast updated list
                
                // Emit updated game state to master screens
                emitGameState();
                
                // Check if we can still continue the game
                checkGameContinuation();
            }
        }
    });

    // Handle player joining
    socket.on('join', (playerName) => {
        if (gameState === States.PREGAME) {
            // Normal join during pregame
            if (players.find((p) => p.id === socket.id || p.name === playerName)) {
                console.log(`⚠️  Player ${playerName} already in game or duplicate name, ignoring join request`);
                return;
            }
            players.push({ id: socket.id, name: playerName, score: 0, prompts: [] });
            connectionStats.joins++;
            socket.emit('joined', { playerId: socket.id, players: players });
            console.log(`✅ Player joined: ${playerName} (${players.length} total players)`);
            io.emit('playerList', players);
            
            // Emit updated game state to master screens
            emitGameState();
        } else {
            // Try to reconnect during active game
            const disconnectedPlayerIndex = disconnectedPlayers.findIndex(p => p.name === playerName);
            if (disconnectedPlayerIndex !== -1) {
                const reconnectingPlayer = disconnectedPlayers[disconnectedPlayerIndex];
                
                // Remove any existing entries with the same name from players array
                players = players.filter(p => p.name !== playerName);
                
                // Update the reconnecting player with new socket ID
                reconnectingPlayer.id = socket.id;
                delete reconnectingPlayer.disconnectedAt;
                
                // Add back to active players
                players.push(reconnectingPlayer);
                disconnectedPlayers.splice(disconnectedPlayerIndex, 1);
                
                // Clean up any remaining duplicates
                cleanupDuplicatePlayers();
                
                socket.emit('joined', { playerId: socket.id, players: players });
                console.log(`✅ Player ${playerName} reconnected successfully (cleaned up duplicates)`);
                io.emit('playerList', players); // Broadcast updated list
                
                // Emit updated game state to master screens
                emitGameState();
                
                // Send them their first unanswered prompt if in answering phase
                if (gameState === States.ANSWERING) {
                    const playerQuestions = questions[crtRound].filter((question) => 
                        question.players.some(p => p.name === playerName));
                    
                    // Find the first unanswered question
                    const firstUnansweredQuestion = playerQuestions.find(question => {
                        const hasAnswered = answers.some(answer => 
                            answer.playerName === playerName && answer.prompt === question.prompt);
                        return !hasAnswered;
                    });
                    
                    if (firstUnansweredQuestion) {
                        console.log(`📨 Sending first unanswered prompt to reconnected ${playerName}: "${firstUnansweredQuestion.prompt.substring(0, 50)}..."`);
                        socket.emit('newPrompt', firstUnansweredQuestion.prompt);
                    } else {
                        console.log(`✅ All prompts already answered by reconnected ${playerName}`);
                    }
                }
            } else {
                socket.emit('gameInProgress', 'Game is already in progress. You can only reconnect if you were previously playing.');
            }
        }
    });

    socket.on('startGame', () => {
        console.log(`🎮 startGame requested by ${socket.id}. Current state: ${gameState}, Players: ${players.length}`);
        if (gameState !== States.PREGAME) {
            console.log(`❌ Cannot start game: not in PREGAME state (currently ${gameState})`);
            return;
        }
        
        if (players.length < 4) {
            console.log(`❌ Cannot start game: need at least 4 players (currently ${players.length})`);
            return;
        }
        
        if (players.length % 2 !== 0) {
            console.log(`❌ Cannot start game: need even number of players (currently ${players.length})`);
            return;
        }
        
        console.log(`✅ Starting game with ${players.length} players`);
        startGame();
        socket.emit('started');
        console.log(`📡 Sent 'started' event to ${socket.id}`);
        
        // Emit updated game state to master screens
        emitGameState();
    });

    // Handle player answers
    socket.on('submitAnswer', (prompt, answer) => {
        console.log(`📝 Received answer from ${getPlayerName(socket.id)}: "${answer}" for prompt: "${prompt}"`);
        
        if (gameState !== States.ANSWERING) {
            console.log(`❌ Cannot submit answer: game not in ANSWERING state (currently ${gameState})`);
            return;
        }
        if (!isPlayerActive(socket.id)) {
            console.log('❌ Ignoring answer from inactive player:', socket.id);
            return;
        }
        
        // Check if player already submitted an answer for this prompt
        const existingAnswer = answers.find(a => a.playerId === socket.id && a.prompt === prompt);
        if (existingAnswer) {
            console.log(`⚠️  Player ${getPlayerName(socket.id)} already submitted answer for this prompt, ignoring`);
            return;
        }
        
        answers.push({ playerId: socket.id, playerName: getPlayerName(socket.id), prompt: prompt, text: answer, votes: 0 });
        console.log(`✅ Answer stored. Total answers: ${answers.length}`);
        
        // Check if this player has more unanswered questions and send the next one
        const playerName = getPlayerName(socket.id);
        const playerQuestions = questions[crtRound].filter((question) => 
            question.players.some(p => p.name === playerName));
        
        const nextUnansweredQuestion = playerQuestions.find(question => {
            const hasAnswered = answers.some(answer => 
                answer.playerName === playerName && answer.prompt === question.prompt);
            return !hasAnswered;
        });
        
        if (nextUnansweredQuestion) {
            console.log(`📨 Sending next unanswered prompt to ${playerName}: "${nextUnansweredQuestion.prompt.substring(0, 50)}..."`);
            socket.emit('newPrompt', nextUnansweredQuestion.prompt);
        }
        
        // Check if we have all answers for this round
        const expectedAnswers = questions[crtRound].length * 2; // 2 answers per question
        console.log(`📊 Answer progress: ${answers.length}/${expectedAnswers} answers received`);
        
        // Emit updated game state to master screens
        emitGameState();
        
        if (answers.length >= expectedAnswers) {
            console.log(`🎯 All answers received! Starting voting phase...`);
            setTimeout(() => {
                startVoting();
            }, 2000); // Give a small delay before starting voting
        }
    });

    socket.on('submitAnswerAsPlayer', (pid, prompt, answer) => {
        if (gameState !== States.ANSWERING) {
            return;
        }
        answers.push({ playerId: pid, playerName: getPlayerName(pid), prompt: prompt, text: answer, votes: 0 });
    });

    socket.on('forceStartVoting', () => {
        startVoting();
    });

    socket.on('forceNextQuestionVote', () => {
        // Safety check: ensure we have valid questions and index
        if (!questions[crtRound] || nextQuestionToVote >= questions[crtRound].length) {
            console.log('⚠️  Invalid question index, ending round');
            endRound();
            return;
        }
        
        mQuestion = questions[crtRound][nextQuestionToVote];
        if (!mQuestion) {
            console.log('⚠️  Question not found, ending round');
            endRound();
            return;
        }
        
        mAnswers = answers.filter((ans) => ans.prompt === mQuestion.prompt);
        gameState = States.VOTING_RESULTS;
        io.emit('votingResults', mQuestion.prompt, mAnswers);
        
        // Emit updated game state to master screens
        emitGameState();
        
        setTimeout(() => {
            nextQuestionToVote++;
            console.log(`➡️  Advancing to next question after force (${nextQuestionToVote + 1}/${questions[crtRound].length})`);
            gameState = States.VOTING;
            startNextQuestionVoting();
        }, 10000 / SPEEDUP);
    });

    // Handle votes
    socket.on('vote', (answerId) => {
        if (gameState !== States.VOTING) {
            return;
        }
        
        if (!isPlayerActive(socket.id)) {
            console.log('Ignoring vote from inactive player:', socket.id);
            return;
        }

        // Check if this player has already voted for this question
        if (socket.hasVotedThisQuestion) {
            console.log('Player %s has already voted for this question, ignoring', socket.id);
            return;
        }

        socket.hasVotedThisQuestion = true;
        cntVotes++;
        console.log("Got vote from %s. CntVotes is %d", socket.id, cntVotes);
        const answer = answers.find(a => a.playerId === answerId);
        if (answer) {
            answer.votes = (answer.votes || 0) + 1;
            const playerIdx = players.findIndex(p => p.id === answerId);
            if (playerIdx >= 0) {
                players[playerIdx].score += 100;
            }
            console.log(players);
        }
        
        // Emit updated game state to master screens
        emitGameState();

        console.log(`Condition {cntVotes} >= {getActivePlayerCount()}`);
        const activePlayerCount = getActivePlayerCount();
        const requiredVotes = Math.max(1, activePlayerCount - 2); // At least 1 vote needed
        if (cntVotes >= requiredVotes) {
            // Clear voting timer since voting is complete
            if (votingTimer) {
                clearTimeout(votingTimer);
                votingTimer = null;
            }
            
            // Safety check: ensure we have valid questions and index
            if (!questions[crtRound] || nextQuestionToVote >= questions[crtRound].length) {
                console.log('⚠️  Invalid question index, ending round');
                endRound();
                return;
            }
            
            mQuestion = questions[crtRound][nextQuestionToVote];
            if (!mQuestion) {
                console.log('⚠️  Question not found, ending round');
                endRound();
                return;
            }
            
            mAnswers = answers.filter((ans) => ans.prompt === mQuestion.prompt);
            gameState = States.VOTING_RESULTS;
            io.emit('votingResults', mQuestion.prompt, mAnswers);
            
            // Emit updated game state to master screens
            emitGameState();
            
            // Wait 10 seconds to show results, then advance to next question
            setTimeout(() => {
                nextQuestionToVote++;
                console.log(`➡️  Advancing to next question (${nextQuestionToVote + 1}/${questions[crtRound].length})`);
                gameState = States.VOTING;
                startNextQuestionVoting();
            }, 10000 / SPEEDUP);
        }
    });
});

// Centralized function to emit complete game state
function emitGameState() {
    const state = {
        phase: gameState,
        players: players.sort((p1, p2) => p2.score - p1.score),
        disconnectedCount: disconnectedPlayers.length,
        currentRound: crtRound + 1,
        totalRounds: nrRounds,
        phaseData: {}
    };

    // Add phase-specific data
    switch (gameState) {
        case States.PREGAME:
            state.phaseData = {
                canStart: players.length >= 4 && players.length % 2 === 0,
                minPlayersNeeded: 4,
                evenPlayersRequired: true
            };
            break;

        case States.ANSWERING:
            const expectedAnswers = questions[crtRound] ? questions[crtRound].length * 2 : 0;
            state.phaseData = {
                questionsCount: questions[crtRound] ? questions[crtRound].length : 0,
                answersReceived: answers.length,
                expectedAnswers: expectedAnswers,
                playerAnswerStatus: players.map(player => ({
                    name: player.name,
                    hasAnswered: answers.some(ans => ans.playerId === player.id)
                }))
            };
            break;

        case States.VOTING:
            if (questions[crtRound] && nextQuestionToVote < questions[crtRound].length) {
                const currentQuestion = questions[crtRound][nextQuestionToVote];
                const currentAnswers = answers.filter(ans => ans.prompt === currentQuestion.prompt);
                state.phaseData = {
                    prompt: currentQuestion.prompt,
                    answers: currentAnswers.map(ans => ({
                        id: ans.playerId,
                        text: ans.text,
                        author: ans.playerName,
                        votes: ans.votes || 0
                    })),
                    questionNumber: nextQuestionToVote + 1,
                    totalQuestions: questions[crtRound].length,
                    timeLeft: 30 // This could be made dynamic based on the actual timer
                };
            }
            break;

        case States.VOTING_RESULTS:
            if (questions[crtRound] && nextQuestionToVote < questions[crtRound].length) {
                const currentQuestion = questions[crtRound][nextQuestionToVote];
                const currentAnswers = answers.filter(ans => ans.prompt === currentQuestion.prompt);
                state.phaseData = {
                    prompt: currentQuestion.prompt,
                    results: currentAnswers.map(ans => ({
                        text: ans.text,
                        author: ans.playerName,
                        votes: ans.votes || 0,
                        score: (ans.votes || 0) * 100
                    })).sort((a, b) => b.votes - a.votes),
                    questionNumber: nextQuestionToVote + 1,
                    totalQuestions: questions[crtRound].length
                };
            }
            break;

        case States.ROUND_RESULTS:
            state.phaseData = {
                scoreboard: players.sort((p1, p2) => p2.score - p1.score),
                timeToNextRound: 10 // seconds
            };
            break;

        case States.FINISHED:
            state.phaseData = {
                winner: players.length > 0 ? players.sort((p1, p2) => p2.score - p1.score)[0] : null,
                finalScoreboard: players.sort((p1, p2) => p2.score - p1.score)
            };
            break;
    }

    console.log(`📡 Emitting game state: ${gameState}`);
    io.emit('updateState', state);
}

function startGame() {
    console.log(`🎮 Starting game with ${players.length} players`);
    players.forEach((player) => {
        player.score = 0;
        player.prompts = [];
    })
    console.log(`📝 Assigning questions...`);
    assignQuestions();
    console.log(`📋 Questions assigned: ${questions.length} rounds`);
    crtRound = 0;
    startRound();
}

function startRound() {
    if (crtRound >= nrRounds) {
        console.log(`🏁 Game completed after ${nrRounds} rounds`);
        gameState = States.FINISHED;
        io.emit("endGame", players);
        
        // Emit updated game state to master screens
        emitGameState();
        return;
    }
    
    // Prevent multiple calls to startRound for the same round
    if (gameState === States.ANSWERING) {
        console.log('⚠️  startRound() called but already in ANSWERING state, ignoring');
        return;
    }
    
    gameState = States.ANSWERING;
    console.log(`🎯 Starting round ${crtRound + 1}/${nrRounds}`);
    io.emit('roundStarted', crtRound + 1);
    console.log(`📋 Round ${crtRound + 1} questions:`, questions[crtRound]?.length || 0);
    
    // Emit updated game state to master screens
    emitGameState();
    votingPhase = false;
    answers = [];
    
    let promptsSent = 0;
    players.forEach((player) => {
        const playerQuestion = questions[crtRound].find((question) => question.players.includes(player));
        if (playerQuestion) {
            console.log(`📨 Sending prompt to ${player.name}: "${playerQuestion.prompt}"`);
            io.to(player.id).emit('newPrompt', playerQuestion.prompt);
            promptsSent++;
        } else {
            console.log(`⚠️  No question found for player ${player.name}`);
        }
    })
    console.log(`📤 Sent ${promptsSent} prompts to ${players.length} players`);
}

function startVoting() {
    console.log(`🗳️  Starting voting phase with ${answers.length} answers`);
    gameState = States.VOTING;
    nextQuestionToVote = 0;
    
    // Broadcast to master that voting started
    io.emit('votingPhaseStarted', {
        totalQuestions: questions[crtRound].length,
        totalAnswers: answers.length
    });
    
    // Emit updated game state to master screens
    emitGameState();
    
    startNextQuestionVoting();
}

function startNextQuestionVoting() {
    // Safety check: ensure we have valid questions and index
    if (!questions[crtRound] || nextQuestionToVote >= questions[crtRound].length) {
        console.log('⚠️  No more questions, ending round');
        endRound();
        return;
    }
    
    mQuestion = questions[crtRound][nextQuestionToVote];
    if (!mQuestion) {
        console.log('⚠️  Question not found, ending round');
        endRound();
        return;
    }
    
    mAnswers = answers.filter((ans) => ans.prompt === mQuestion.prompt);
    cntVotes = 0;
    
    // Reset voting flags for all connected players
    io.sockets.sockets.forEach(socket => {
        socket.hasVotedThisQuestion = false;
    });
    
    io.emit('startVoting', mQuestion.prompt, mAnswers);
    console.log(`🗳️  Starting voting for question ${nextQuestionToVote + 1}/${questions[crtRound].length}: "${mQuestion.prompt}"`);
    
    // Emit updated game state to master screens
    emitGameState();
    
    // Set timeout for voting (30 seconds)
    if (votingTimer) {
        clearTimeout(votingTimer);
    }
    votingTimer = setTimeout(() => {
        console.log('Voting timeout reached, showing results...');
        // Safety check: ensure mQuestion is valid
        if (!mQuestion) {
            console.log('⚠️  Question not found during timeout, ending round');
            endRound();
            return;
        }
        gameState = States.VOTING_RESULTS;
        io.emit('votingResults', mQuestion.prompt, mAnswers);
        
        // Emit updated game state to master screens
        emitGameState();
        
        setTimeout(() => {
            nextQuestionToVote++;
            console.log(`➡️  Advancing to next question after timeout (${nextQuestionToVote + 1}/${questions[crtRound].length})`);
            gameState = States.VOTING;
            startNextQuestionVoting();
        }, 10000 / SPEEDUP);
    }, 30000 / SPEEDUP);
}

function endRound() {
    // Prevent multiple calls to endRound
    if (isEndingRound) {
        console.log('⚠️  endRound() called but already ending round, ignoring');
        return;
    }
    
    isEndingRound = true;
    console.log(`🏁 Round ${crtRound + 1} completed`);
    gameState = States.ROUND_RESULTS;
    
    // Clear any existing voting timer
    if (votingTimer) {
        clearTimeout(votingTimer);
        votingTimer = null;
    }
    
    io.emit('roundEnd', players);
    
    // Emit updated game state to master screens
    emitGameState();
    setTimeout(() => {
        crtRound++;
        isEndingRound = false; // Reset flag before starting next round
        startRound();
    }, 10000 / SPEEDUP);
}

// Removed duplicate function - moved to utility functions section

function assignQuestions() {
    questions = [];
    const shuffledPrompts = [...crtPrompts].sort(() => 0.5 - Math.random()); // Don't mutate original
    const activePlayerCount = getActivePlayerCount();
    const questionsPerRound = Math.floor(activePlayerCount / 2);
    
    console.log(`📝 Assigning questions: ${activePlayerCount} players, ${questionsPerRound} questions per round`);
    
    if (questionsPerRound < 1) {
        console.log('❌ Not enough players to assign questions');
        return;
    }
    
    let iPrompt = 0;
    for (let i = 0; i < nrRounds; i++) {
        const shuffledPlayers = [...players].sort(() => 0.5 - Math.random()); // Don't mutate original
        let roundQuestions = [];
        
        console.log(`📋 Round ${i + 1}: Assigning ${questionsPerRound} questions to ${shuffledPlayers.length} players`);
        
        for (let j = 0; j < questionsPerRound; j++) {
            if (j * 2 + 1 < shuffledPlayers.length) {
                const player1 = shuffledPlayers[j * 2];
                const player2 = shuffledPlayers[j * 2 + 1];
                const prompt = shuffledPrompts[iPrompt % shuffledPrompts.length];
                
                roundQuestions.push({
                    prompt: prompt,
                    players: [player1, player2]
                });
                
                console.log(`   Q${j + 1}: "${prompt}" -> ${player1.name} vs ${player2.name}`);
                iPrompt++;
            }
        }
        questions.push(roundQuestions);
    }
    
    console.log(`✅ Questions assigned: ${questions.length} rounds total`);
}

// Utility functions for handling disconnections
function getActivePlayerCount() {
    return players.length;
}

function getAllPlayerCount() {
    return players.length + disconnectedPlayers.length;
}

function checkGameContinuation() {
    const activePlayerCount = getActivePlayerCount();
    console.log(`Active players: ${activePlayerCount}, Disconnected players: ${disconnectedPlayers.length}`);
    
    // If too few players remain, we might want to pause or end the game
    if (activePlayerCount < 2) {
        console.log('Too few active players, pausing game...');
        io.emit('gamePaused', 'Game paused due to too few active players. Waiting for reconnections...');
        return false;
    }
    
    // If we're in voting phase and not enough players to continue voting
    if (gameState === States.VOTING && activePlayerCount < 3) {
        console.log('Not enough players for voting, auto-advancing...');
        // Auto-advance to next question or end round
        setTimeout(() => {
            nextQuestionToVote++;
            startNextQuestionVoting();
        }, 2000);
        return false;
    }
    
    return true;
}

function getPlayerName(playerId) {
    let player = players.find((p) => p.id === playerId);
    if (player) {
        return player.name;
    }
    // Check disconnected players too
    player = disconnectedPlayers.find((p) => p.id === playerId);
    if (player) {
        return player.name;
    }
    return 'Unknown Player';
}

function isPlayerActive(playerId) {
    return players.some(p => p.id === playerId);
}

function cleanupDuplicatePlayers() {
    const uniquePlayers = [];
    const seenNames = new Set();
    const seenIds = new Set();
    
    for (const player of players) {
        if (!seenNames.has(player.name) && !seenIds.has(player.id)) {
            uniquePlayers.push(player);
            seenNames.add(player.name);
            seenIds.add(player.id);
        } else {
            console.log(`🧹 Removing duplicate player: ${player.name} (${player.id})`);
        }
    }
    
    if (uniquePlayers.length !== players.length) {
        console.log(`🧹 Cleaned up ${players.length - uniquePlayers.length} duplicate players`);
        players = uniquePlayers;
        io.emit('playerList', players);
        return true;
    }
    
    return false;
}

// Error handling for socket.io
io.on('error', (error) => {
    console.error('❌ Socket.IO error:', error);
    connectionStats.errors++;
});

// Periodic statistics reporting and cleanup
setInterval(() => {
    if (totalConnections > 0 || players.length > 0) {
        // Clean up any duplicate players
        cleanupDuplicatePlayers();
        
        console.log(`📊 Server Stats: Connections: ${totalConnections}, Players: ${players.length}, Disconnected: ${disconnectedPlayers.length}, State: ${gameState}`);
        console.log(`📈 Connection Stats: Connects: ${connectionStats.connects}, Disconnects: ${connectionStats.disconnects}, Joins: ${connectionStats.joins}, Errors: ${connectionStats.errors}`);
    }
}, 30000); // Every 30 seconds

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    console.log(`📊 Final Stats: Peak Connections: ${peakConnections}, Total Connects: ${connectionStats.connects}, Total Disconnects: ${connectionStats.disconnects}`);
    process.exit(0);
});

http.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📊 Monitoring connections and game state...`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 Server accessible on all interfaces (0.0.0.0:${port})`);
}).on('error', (err) => {
    console.error('❌ Server failed to start:', err);
    process.exit(1);
});