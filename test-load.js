const { io } = require('socket.io-client');

class GameBot {
    constructor(playerName, serverUrl = 'http://localhost:3000') {
        this.playerName = playerName;
        this.serverUrl = serverUrl;
        this.socket = null;
        this.joined = false;
        this.currentPrompt = null;
        this.gameStarted = false;
        this.logs = [];
        this.connectionStartTime = Date.now();
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${this.playerName}: ${message}`;
        console.log(logEntry);
        this.logs.push(logEntry);
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.socket = io(this.serverUrl, {
                transports: ['websocket'],
                timeout: 10000,
                forceNew: true
            });

            this.socket.on('connect', () => {
                const connectionTime = Date.now() - this.connectionStartTime;
                this.log(`Connected to server (took ${connectionTime}ms)`);
                this.setupEventHandlers();
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                this.log(`Connection error: ${error.message}`);
                reject(error);
            });

            this.socket.on('disconnect', (reason) => {
                this.log(`Disconnected: ${reason}`);
                if (reason === 'io server disconnect') {
                    // The disconnection was initiated by the server
                    this.log('Server disconnected the socket');
                }
            });
        });
    }

    setupEventHandlers() {
        this.socket.on('joined', (data) => {
            this.joined = true;
            this.log(`Successfully joined game with ID: ${data.playerId}`);
        });

        this.socket.on('playerList', (playerList) => {
            this.log(`Player list updated: ${playerList.length} players`);
        });

        this.socket.on('started', () => {
            this.log('Received started event - game initiation acknowledged');
            // Don't set gameStarted yet - wait for roundStarted
        });

        this.socket.on('roundStarted', (round) => {
            this.gameStarted = true;
            this.log(`🎮 Round ${round} started! Game is now active.`);
        });

        this.socket.on('newPrompt', (prompt) => {
            this.currentPrompt = prompt;
            this.log(`📝 Received prompt: "${prompt}"`);
            // Simulate thinking time (1-5 seconds)
            setTimeout(() => {
                this.submitRandomAnswer();
            }, Math.random() * 4000 + 1000);
        });

        this.socket.on('startVoting', (prompt, answers) => {
            this.log(`Voting started for: "${prompt}" with ${answers.length} answers`);
            // Simulate voting time (1-10 seconds)
            setTimeout(() => {
                this.voteRandomly(answers);
            }, Math.random() * 9000 + 1000);
        });

        this.socket.on('votingResults', (prompt, answers) => {
            this.log(`Voting results for: "${prompt}"`);
            answers.forEach(ans => {
                this.log(`  "${ans.text}" by ${ans.playerName}: ${ans.votes} votes`);
            });
        });

        this.socket.on('roundEnd', (players) => {
            this.log(`Round ended. Current scores:`);
            players.forEach(p => {
                this.log(`  ${p.name}: ${p.score} points`);
            });
        });

        this.socket.on('endGame', (players) => {
            this.log(`Game ended! Final scores:`);
            players.forEach((p, index) => {
                this.log(`  ${index + 1}. ${p.name}: ${p.score} points`);
            });
        });

        this.socket.on('gameInProgress', (message) => {
            this.log(`Cannot join: ${message}`);
        });

        this.socket.on('gamePaused', (message) => {
            this.log(`Game paused: ${message}`);
        });

        // Error handling
        this.socket.on('error', (error) => {
            this.log(`Socket error: ${error}`);
        });

        // Debug: Listen for all events to see what's happening
        this.socket.onAny((eventName, ...args) => {
            if (!['playerList', 'state_dump'].includes(eventName)) {
                this.log(`🔍 Received event: ${eventName} with args: ${JSON.stringify(args)}`);
            }
        });
    }

    joinGame() {
        if (!this.socket || !this.socket.connected) {
            this.log('Cannot join - not connected to server');
            return;
        }
        
        this.log('Attempting to join game...');
        this.socket.emit('join', this.playerName);
    }

    submitRandomAnswer() {
        if (!this.currentPrompt) {
            this.log('No prompt to answer');
            return;
        }

        const randomAnswers = [
            'A very funny response',
            'Something hilarious',
            'The best answer ever',
            'Comedy gold',
            'Absolutely ridiculous',
            'Surprisingly witty',
            'Unexpectedly clever',
            'Pure genius',
            'Totally absurd',
            'Brilliantly stupid'
        ];

        const answer = randomAnswers[Math.floor(Math.random() * randomAnswers.length)];
        this.log(`📤 Submitting answer: "${answer}" for prompt: "${this.currentPrompt}"`);
        this.socket.emit('submitAnswer', this.currentPrompt, answer);
    }

    voteRandomly(answers) {
        if (answers.length === 0) {
            this.log('No answers to vote for');
            return;
        }

        const randomAnswer = answers[Math.floor(Math.random() * answers.length)];
        this.log(`Voting for answer by player: ${randomAnswer.playerName}`);
        this.socket.emit('vote', randomAnswer.playerId);
    }

    disconnect() {
        if (this.socket) {
            this.log('Disconnecting from server...');
            this.socket.disconnect();
        }
    }

    // Simulate random disconnection
    simulateRandomDisconnection() {
        const disconnectionChance = 0.1; // 10% chance
        if (Math.random() < disconnectionChance) {
            this.log('Simulating random disconnection');
            this.socket.disconnect();
            
            // Reconnect after 5-15 seconds
            setTimeout(() => {
                this.log('Attempting to reconnect...');
                this.connect().then(() => {
                    this.joinGame();
                }).catch(err => {
                    this.log(`Reconnection failed: ${err.message}`);
                });
            }, Math.random() * 10000 + 5000);
        }
    }

    // Get performance metrics
    getMetrics() {
        return {
            playerName: this.playerName,
            connected: this.socket && this.socket.connected,
            joined: this.joined,
            gameStarted: this.gameStarted,
            totalLogs: this.logs.length,
            socketId: this.socket ? this.socket.id : null
        };
    }
}

class LoadTester {
    constructor(numPlayers = 20, serverUrl = 'http://localhost:3000') {
        this.numPlayers = numPlayers;
        this.serverUrl = serverUrl;
        this.bots = [];
        this.testStartTime = null;
        this.gameInProgress = false;
    }

    async runLoadTest() {
        console.log(`\n🚀 Starting load test with ${this.numPlayers} players...`);
        this.testStartTime = Date.now();

        // Create bots
        for (let i = 0; i < this.numPlayers; i++) {
            const bot = new GameBot(`TestPlayer${i + 1}`, this.serverUrl);
            this.bots.push(bot);
        }

        // Connect all bots with staggered timing to simulate real users
        console.log('📡 Connecting players...');
        const connectionPromises = this.bots.map((bot, index) => {
            return new Promise((resolve) => {
                // Stagger connections by 100ms each
                setTimeout(async () => {
                    try {
                        await bot.connect();
                        resolve();
                    } catch (error) {
                        console.error(`Failed to connect ${bot.playerName}:`, error.message);
                        resolve();
                    }
                }, index * 100);
            });
        });

        await Promise.all(connectionPromises);

        // Wait a bit, then join all players
        console.log('👥 Joining players to game...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        this.bots.forEach((bot, index) => {
            // Stagger joins by 50ms each
            setTimeout(() => {
                bot.joinGame();
            }, index * 50);
        });

        // Wait for players to join, then start monitoring
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Auto-start the game if we have enough players
        setTimeout(() => {
            this.autoStartGame();
        }, 2000); // Wait 2 more seconds for all players to be ready
        
        this.startMonitoring();

        return new Promise((resolve) => {
            // Set up game end detection
            const checkGameEnd = () => {
                const activeBot = this.bots.find(bot => bot.socket && bot.socket.connected);
                if (activeBot) {
                    activeBot.socket.once('endGame', () => {
                        console.log('🎉 Game ended, stopping test...');
                        resolve();
                    });
                }
            };

            checkGameEnd();
            
            // Also set a maximum test duration (10 minutes)
            setTimeout(() => {
                console.log('⏰ Test timeout reached, stopping...');
                resolve();
            }, 10 * 60 * 1000);
        });
    }

    autoStartGame() {
        const connectedBots = this.bots.filter(bot => bot.socket && bot.socket.connected);
        const joinedBots = this.bots.filter(bot => bot.joined);
        
        console.log(`🎮 Checking game start conditions:`);
        console.log(`   Connected: ${connectedBots.length}/${this.numPlayers}`);
        console.log(`   Joined: ${joinedBots.length}/${this.numPlayers}`);
        
        if (joinedBots.length >= 4 && joinedBots.length % 2 === 0) {
            console.log('✅ Conditions met, starting game automatically...');
            // Have the first bot start the game
            const masterBot = joinedBots[0];
            if (masterBot && masterBot.socket && masterBot.socket.connected) {
                masterBot.socket.emit('startGame');
                masterBot.log('🎮 Acting as master - emitting startGame event');
                
                // Set a timer to check if the game actually started
                setTimeout(() => {
                    this.checkGameProgress();
                }, 5000);
            } else {
                console.log('❌ Master bot not available to start game');
            }
        } else {
            console.log(`⚠️  Cannot start game: need at least 4 players and even number. Current: ${joinedBots.length}`);
            
            // Try again in 5 seconds if we're still missing players
            if (joinedBots.length < this.numPlayers) {
                console.log('🔄 Will retry starting game in 5 seconds...');
                setTimeout(() => {
                    this.autoStartGame();
                }, 5000);
            }
        }
    }

    startMonitoring() {
        console.log('\n📊 Starting monitoring...');
        
        // Monitor every 10 seconds
        const monitorInterval = setInterval(() => {
            this.printStatus();
        }, 10000);

        // Simulate random disconnections every 30 seconds
        const disconnectionInterval = setInterval(() => {
            this.simulateRandomDisconnections();
        }, 30000);

        // Clean up intervals when test ends
        process.on('SIGINT', () => {
            clearInterval(monitorInterval);
            clearInterval(disconnectionInterval);
            this.cleanup();
            process.exit(0);
        });
    }

    printStatus() {
        const connectedBots = this.bots.filter(bot => bot.socket && bot.socket.connected);
        const joinedBots = this.bots.filter(bot => bot.joined);
        const gameStartedBots = this.bots.filter(bot => bot.gameStarted);
        const botsWithPrompts = this.bots.filter(bot => bot.currentPrompt);

        console.log(`\n📈 Status Report:`);
        console.log(`   Connected: ${connectedBots.length}/${this.numPlayers}`);
        console.log(`   Joined: ${joinedBots.length}/${this.numPlayers}`);
        console.log(`   Game Started: ${gameStartedBots.length}/${this.numPlayers}`);
        console.log(`   Received Prompts: ${botsWithPrompts.length}/${this.numPlayers}`);
        console.log(`   Test Duration: ${((Date.now() - this.testStartTime) / 1000).toFixed(1)}s`);

        // Show any error patterns
        const errors = this.bots.map(bot => bot.logs.filter(log => log.includes('error') || log.includes('failed')).length);
        const totalErrors = errors.reduce((sum, count) => sum + count, 0);
        if (totalErrors > 0) {
            console.log(`   ⚠️  Total Errors: ${totalErrors}`);
        }

        // Debug: Show what events the first few bots have seen
        if (gameStartedBots.length === 0 && joinedBots.length > 0) {
            console.log(`\n🔍 Debug: Recent events from first bot:`);
            const firstBot = joinedBots[0];
            const recentLogs = firstBot.logs.slice(-5);
            recentLogs.forEach(log => console.log(`   ${log}`));
        }
    }

    simulateRandomDisconnections() {
        const activeBot = this.bots.filter(bot => bot.socket && bot.socket.connected);
        if (activeBot.length > 0) {
            console.log('🔀 Simulating random disconnections...');
            activeBot.forEach(bot => bot.simulateRandomDisconnection());
        }
    }

    checkGameProgress() {
        const gameStartedBots = this.bots.filter(bot => bot.gameStarted);
        const botsWithPrompts = this.bots.filter(bot => bot.currentPrompt);
        
        console.log(`\n🔍 Game Progress Check:`);
        console.log(`   Bots that think game started: ${gameStartedBots.length}/${this.numPlayers}`);
        console.log(`   Bots that received prompts: ${botsWithPrompts.length}/${this.numPlayers}`);
        
        if (gameStartedBots.length === 0 && botsWithPrompts.length === 0) {
            console.log(`❌ Game doesn't appear to have started properly!`);
            console.log(`   This suggests an issue with the game start conditions.`);
            console.log(`   Check the master page at http://localhost:3000/master/ to see the actual state.`);
        }
    }

    cleanup() {
        console.log('\n🧹 Cleaning up...');
        this.bots.forEach(bot => {
            bot.disconnect();
        });
    }

    // Get detailed metrics
    getDetailedMetrics() {
        return {
            totalPlayers: this.numPlayers,
            testDuration: this.testStartTime ? (Date.now() - this.testStartTime) / 1000 : 0,
            botMetrics: this.bots.map(bot => bot.getMetrics()),
            summary: {
                connected: this.bots.filter(bot => bot.socket && bot.socket.connected).length,
                joined: this.bots.filter(bot => bot.joined).length,
                gameStarted: this.bots.filter(bot => bot.gameStarted).length
            }
        };
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const numPlayers = parseInt(args[0]) || 20;
    const serverUrl = args[1] || 'http://localhost:3000';

    console.log(`🎮 Quiplash Load Tester`);
    console.log(`   Players: ${numPlayers}`);
    console.log(`   Server: ${serverUrl}`);
    console.log(`   Use Ctrl+C to stop the test\n`);

    const tester = new LoadTester(numPlayers, serverUrl);
    
    try {
        await tester.runLoadTest();
    } catch (error) {
        console.error('❌ Load test failed:', error);
    } finally {
        console.log('\n📊 Final Metrics:');
        console.log(JSON.stringify(tester.getDetailedMetrics(), null, 2));
        tester.cleanup();
    }
}

if (require.main === module) {
    main();
}

module.exports = { GameBot, LoadTester }; 