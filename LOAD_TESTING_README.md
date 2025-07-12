# 🎮 Quiplash Load Testing Guide

This guide explains how to test your Quiplash game with multiple simulated players to identify issues that occur with 15-20 concurrent players.

## 🚀 Quick Start

### 1. Start Your Game Server
```bash
# Terminal 1: Start the game server
npm start
```

### 2. Run Load Tests
```bash
# Terminal 2: Run different load test scenarios

# Test with 10 players
npm run test-load-10

# Test with 20 players  
npm run test-load-20

# Custom number of players
node test-load.js 15

# Simple connection test
node simple-test.js
```

## 📋 Test Scenarios

### Small Load Test (10 players)
```bash
npm run test-load-10
```
- Tests basic functionality with moderate load
- Good for initial testing
- Should complete without major issues

### Medium Load Test (15 players)
```bash
node test-load.js 15
```
- Tests the problematic range you experienced
- Helps identify breaking points
- Simulates your real-world scenario

### Large Load Test (20 players)
```bash
npm run test-load-20
```
- Stress test with high concurrent users
- Identifies performance bottlenecks
- Tests server limits

## 🔍 What the Tests Do

### Automated Player Simulation
Each bot automatically:
- ✅ Connects to the server
- ✅ Joins the game with a unique name
- ✅ Submits random answers to prompts
- ✅ Votes on other players' answers
- ✅ Simulates random disconnections/reconnections
- ✅ Logs all activities and errors

### Connection Monitoring
The server now tracks:
- 📊 Current active connections
- 📈 Peak connection count
- 🔄 Connect/disconnect events
- ❌ Error occurrences
- 📝 Detailed activity logs

## 📊 Reading Test Results

### Real-time Monitoring
While tests run, you'll see:
```
📈 Status Report:
   Connected: 18/20
   Joined: 17/20
   Game Started: 16/20
   Test Duration: 45.3s
   ⚠️  Total Errors: 3
```

### Server Logs
The server shows:
```
👤 User connected: abc123 (Total: 15, Peak: 18)
✅ Player joined: TestPlayer12 (15 total players)
👋 Player disconnected: abc123 (Reason: transport close, Total: 14)
```

## 🐛 Common Issues to Watch For

### 1. Connection Drops
- **Symptoms**: Players disconnect unexpectedly
- **Look for**: "transport close", "ping timeout"
- **Fix**: Adjust socket.io timeout settings

### 2. Memory Leaks
- **Symptoms**: Server slows down over time
- **Look for**: Increasing response times
- **Fix**: Check for uncleaned event listeners

### 3. Race Conditions
- **Symptoms**: Game state inconsistencies
- **Look for**: Players stuck in wrong state
- **Fix**: Add proper state validation

### 4. Voting Deadlocks
- **Symptoms**: Game stops progressing
- **Look for**: Voting phase never ends
- **Fix**: Implement voting timeouts (already added)

## 🛠️ Advanced Testing Options

### Custom Test Parameters
```javascript
// Create custom test scenario
const { LoadTester } = require('./test-load.js');

const tester = new LoadTester(15, 'http://localhost:3000');
tester.runLoadTest();
```

### Stress Testing
```bash
# Test with gradual load increase
node test-load.js 5   # Start small
node test-load.js 10  # Increase
node test-load.js 15  # Your problem range
node test-load.js 20  # Maximum test
```

### Network Simulation
The load tester automatically:
- 🔀 Simulates random disconnections (10% chance)
- 🔄 Tests reconnection logic
- ⏱️ Varies response times (1-10 seconds)
- 📡 Staggers connections (realistic timing)

## 🎯 Testing Best Practices

### 1. Before Testing
- ✅ Server is running (`npm start`)
- ✅ No existing players connected
- ✅ Clean terminal for clear output

### 2. During Testing
- 📱 Monitor both server and client terminals
- 📊 Watch for error patterns
- 🕒 Let tests run for at least 2-3 minutes

### 3. After Testing
- 📝 Save logs if issues found
- 🔄 Restart server between tests
- 📈 Compare results across different player counts

## 🔧 Server Optimizations Added

Your server now includes:
- **Better Socket.IO Config**: Improved timeout/ping settings
- **Connection Monitoring**: Real-time statistics
- **Graceful Disconnection**: Proper cleanup
- **Reconnection Support**: Players can rejoin games
- **Voting Timeouts**: Prevents stuck games
- **Memory Management**: Better resource handling

## 🎮 Manual Testing Workflow

1. **Start Server**: `npm start`
2. **Run Load Test**: `npm run test-load-15`
3. **Start Game**: Visit `http://localhost:3000/master/` and click "Start Game"
4. **Monitor**: Watch both terminals for issues
5. **Analyze**: Check final metrics and logs

## 🆘 Troubleshooting

### Test Won't Start
```bash
# Check if server is running
curl http://localhost:3000

# Check for port conflicts
lsof -i :3000
```

### Connection Errors
- Verify server is accessible
- Check firewall settings
- Ensure port 3000 is available

### Game Doesn't Progress
- Check if minimum players joined (4 minimum)
- Verify even number of players
- Look for stuck voting phases

## 📋 Example Test Session

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Run test
npm run test-load-15

# Expected output:
🚀 Starting load test with 15 players...
📡 Connecting players...
👥 Joining players to game...
📊 Starting monitoring...

📈 Status Report:
   Connected: 15/15
   Joined: 15/15
   Game Started: 15/15
   Test Duration: 23.4s

🎉 Game ended, stopping test...
```

## 📞 Getting Help

If you find issues:
1. 📝 Save the terminal output
2. 🔍 Note the player count when issues occur
3. 📊 Check the final metrics
4. 🎯 Try smaller player counts to isolate the problem

The load testing framework will help you identify exactly where your game breaks down with multiple players and provide detailed logs to fix the issues! 