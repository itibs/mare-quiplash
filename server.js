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
    'Predica pe care Adiel Dinu o va ține minte toată viața este ...',
    'Cu toții știm că Philip nu s-ar muta în veci în altă țară. Mai puțin dacă ...',
    'Cea mai mare gafă ce poate fi spusă într-o predică de nuntă: ...',
    'Nu spune niciodată unui polițist: "..."',
    'Cea mai bizară proorocie pe care o poți primi într-o biserică penticostală: "..."',
    'Dacă Ap. Pavel ar fi călătorit în timp în vremea noastră, ar zice că ...',
    'Un lucru pe care îl poți întâlni doar în BER: ...',
    'O idee proastă de a convinge un coleg să vină la biserică: ...',
    'Un principiu de nestrămutat în viața Verei este: ...',
    'Titlu de carte creștină pe care nu te-ai aștepta să o vezi în Cărturești: ...',
    'Gabi ar merge misionar în Asia cu condiția: ...',
    'Un lucru interesant pe care l-ai putea găsi într-o Biblie a unui frate în vârstă: ...',
    'Proba secretă pentru a intra în Corul Evanghelic: ...',
    'Replica lui Dantes oferindu-i-se o carte arminiană: "..."',
    'Dacă Alina ar avea mai multe zile de concediu ...',
    'Un lucru neobișnuit pe care-l poți găsi în cutia dărniciei este: ...',
    'Un nume biblic pe care nu îndrăznește nimeni să-l pună propriului copil e ...',
    'Om random din Herăstrău primind sceptic un calendar GBV: "..."',
    'O regulă atipică pentru o tabără de tineret: ...',
    'Ceva ce nu ar trebui niciodată să-i spui unui misionar: "..."',
    'Autor pe care nu te-ai aștepta să-l întâlnești în biblioteca lui Tibi: ...',
    'Dani M. se ridică în mijlocul adunării cu entuziasm: "haidem să cântăm ...!"',
    'Un titlu atipic pentru o broșură de evanghelizare: ...',
    'O mustrare pe care n-ai vrea să o auzi din partea unui necredincios: "..."',
    'Secret Hitler a fost interzis în tabără după ce...',
    'Adevăratul motiv pentru care tabara s-a mutat la Harghita: ...',
    'Un om care merge în Panduri se cunoaște după ...',
    'Înainte de renovare, Villa Ursu se numea ...',
    'Ingredientul secret pentru pastele de la prânz a fost ...',
    'O probă nouă la jocurile olimpice, dedicată lui David Deaconu',
    'Când nu îmi fac temele, părinții spun că ...',
    'Dacă ar fi primar, Horia ar forța pe toată lumea să ...',
    'Dacă nu ar fi plouat, Lucian Gava ar fi ...',
    'Înainte să vin în tabără m-am asigurat că ...',
    'Timpul trece foarte greu în tabără atunci când ...',
    'Cel mai plictisitor joc din tabără este ...',
    'Un lucru care lipsește din camere este ...'
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


io.on('connection', (socket) => {
    console.log('A user connected');

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
    });

    socket.on('getPlayerList', () => {
        io.emit('playerList', players);
    })

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
    socket.on('disconnect', () => {
        // TODO
        if (gameState !== States.PREGAME) {
            return;
        }
        players = players.filter(player => player.id !== socket.id);
        io.emit('playerList', players);
    });

    // Handle player joining
    socket.on('join', (playerName) => {
        if (gameState !== States.PREGAME) {
            return;
        }
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
        if (gameState !== States.PREGAME) {
            return;
        }
        startGame();
        socket.emit('started');
    });

    // Handle player answers
    socket.on('submitAnswer', (prompt, answer) => {
        if (gameState !== States.ANSWERING) {
            return;
        }
        answers.push({ playerId: socket.id, playerName: getPlayerName(socket.id), prompt: prompt, text: answer, votes: 0 });
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
        mQuestion = questions[crtRound][nextQuestionToVote];
        mAnswers = answers.filter((ans) => ans.prompt === mQuestion.prompt);
        io.emit('votingResults', mQuestion.prompt, mAnswers);
        setTimeout(() => {
            nextQuestionToVote++;
            startNextQuestionVoting();
        }, 8000 / SPEEDUP);
    });

    // Handle votes
    socket.on('vote', (answerId) => {
        if (gameState !== States.VOTING) {
            return;
        }

        cntVotes++;
        console.log("Got vote from %s. CntVotes is %d", answerId, votingPhase);
        const answer = answers.find(a => a.playerId === answerId);
        if (answer) {
            answer.votes = (answer.votes || 0) + 1;
            const playerIdx = players.findIndex(p => p.id === answerId);
            if (playerIdx >= 0) {
                players[playerIdx].score += 100;
            }
            console.log(players);
        }

        console.log(`Condition {cntVotes} >= {players.length}`);
        if (cntVotes >= players.length - 2) {
            mQuestion = questions[crtRound][nextQuestionToVote];
            mAnswers = answers.filter((ans) => ans.prompt === mQuestion.prompt);
            io.emit('votingResults', mQuestion.prompt, mAnswers);
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
    gameState = States.ANSWERING;
    console.log("Starting round %d", crtRound);
    io.emit('roundStarted', crtRound + 1);
    console.log("Questions:");
    console.log(questions);
    votingPhase = false;
    answers = [];
    players.forEach((player) => {
        const playerQuestion = questions[crtRound].find((question) => question.players.includes(player));
        if (playerQuestion) {
            io.to(player.id).emit('newPrompt', playerQuestion.prompt);
        }
    })
}

function startVoting() {
    gameState = States.VOTING;
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