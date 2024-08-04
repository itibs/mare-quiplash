const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const port = 3000;

const SPEEDUP = 1;

// Config
let nrRounds = 2;

// Game state
let players = [];
let questions = [];
let answers = [];
let votingPhase = false;
let crtRound = 0;
let nextQuestionToVote = 0;
let cntVotes = 0;

// Game constants
const INITIAL_PROMPTS = [
    "The worst superhero power",
    "A terrible name for a cruise ship",
    "The last thing you'd want to find in your closet",
    "If you were alone on an island, you would like to have...",
];

let crtPrompts = INITIAL_PROMPTS;

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


io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('resetAll', () => {
        players = [];
        disconnectedPlayers = [];
        questions = [];
        answers = [];
        votingPhase = false;
        crtRound = 0;
        nextQuestionToVote = 0;
        cntVotes = 0;
    });

    socket.on('getPlayerList', () => {
        io.emit('playerList', players);
    })

    socket.on('newPrompts', (prompts) => {
        crtPrompts = prompts;
    });

    // Handle player joining
    socket.on('join', (playerName) => {
        if (players.find((p) => p.id === socket.id)) {
            return;
        }
        players.push({ id: socket.id, name: playerName, score: 0, prompts: [] });
        socket.emit('joined', { playerId: socket.id, players: players });
        console.log("Emitting playerList:")
        console.log(players);
        io.emit('playerList', players);
    });

    socket.on('startGame', () => {
        startGame();
        socket.emit('started');
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        players = players.filter(player => player.id !== socket.id);
        io.emit('playerList', players);
    });

    // Handle player answers
    socket.on('submitAnswer', (prompt, answer) => {
        if (!votingPhase) {
            answers.push({ playerId: socket.id, playerName: getPlayerName(socket.id), prompt: prompt, text: answer, votes: 0 });
            if (answers.length === players.length) {
                startVoting();
            }
        }
    });

    // Handle votes
    socket.on('vote', (answerId) => {
        if (votingPhase) {
            cntVotes++;
            const answer = answers.find(a => a.playerId === answerId);
            if (answer) {
                answer.votes = (answer.votes || 0) + 1;
                const playerIdx = players.findIndex(p => p.id === answerId);
                if (playerIdx >= 0) {
                    players[playerIdx].score += 100;
                }
                console.log(players);
            }

            if (cntVotes >= players.length - 2) {
                mQuestion = questions[crtRound][nextQuestionToVote];
                mAnswers = answers.filter((ans) => ans.prompt === mQuestion.prompt);
                io.emit('votingResults', mQuestion.prompt, mAnswers);
                setTimeout(() => {
                    nextQuestionToVote++;
                    startNextQuestionVoting();
                }, 8000 / SPEEDUP);
            }
        }
    });
});

function startGame() {
    console.log("Starting game");
    players.forEach((player) => {
        player.score = 0;
        player.prompts = [];
    })
    assignQuestions();
    crtRound = 0;
    startRound();
}

function startRound() {
    if (crtRound >= nrRounds) {
        io.emit("endGame", players)
        return;
    }
    console.log("Starting round %d", crtRound);
    io.emit('roundStarted', crtRound + 1);
    console.log("Questions:");
    console.log(questions);
    votingPhase = false;
    answers = [];
    players.forEach((player) => {
        const playerQuestion = questions[crtRound].find((question) => question.players.includes(player));
        io.to(player.id).emit('newPrompt', playerQuestion.prompt);
    })
}

function startVoting() {
    votingPhase = true;
    nextQuestionToVote = 0;
    startNextQuestionVoting();
}

function startNextQuestionVoting() {
    if (nextQuestionToVote >= questions[crtRound].length) {
        endRound();
        return
    }
    mQuestion = questions[crtRound][nextQuestionToVote];
    mAnswers = answers.filter((ans) => ans.prompt === mQuestion.prompt);
    cntVotes = 0;
    io.emit('startVoting', mQuestion.prompt, mAnswers);
}

function endRound() {
    io.emit('roundEnd', players);
    setTimeout(() => {
        crtRound++;
        startRound();
    }, 10000 / SPEEDUP);
}

function getPlayerName(playerId) {
    let player = players.find((p) => p.id === playerId);
    if (player) {
        return player.name;
    }
}

function assignQuestions() {
    questions = [];
    const shuffledPrompts = crtPrompts.sort(() => 0.5 - Math.random());
    const questionsPerRound = Math.floor(players.length / 2);
    let iPrompt = 0;
    for (let i = 0; i < nrRounds; i++) {
        const shuffledPlayers = players.sort(() => 0.5 - Math.random());
        let roundQuestions = [];
        for (let i = 0; i < questionsPerRound; i++) {
            roundQuestions.push({
                prompt: shuffledPrompts[iPrompt % shuffledPrompts.length],
                players: [shuffledPlayers[i * 2], shuffledPlayers[i * 2 + 1]]
            })
            iPrompt++;
        }
        questions.push(roundQuestions);
    }
}


http.listen(port, () => {
    console.log(`Server running on port ${port}`);
});