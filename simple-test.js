const { GameBot } = require('./test-load.js');

async function simpleTest() {
    console.log('🧪 Running simple connection test...');
    
    // Create a single bot to test connection
    const bot = new GameBot('TestBot', 'http://localhost:3000');
    
    try {
        // Test connection
        await bot.connect();
        console.log('✅ Connection successful!');
        
        // Test joining
        bot.joinGame();
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check metrics
        const metrics = bot.getMetrics();
        console.log('📊 Bot metrics:', metrics);
        
        // Disconnect
        bot.disconnect();
        
        console.log('🎉 Simple test completed successfully!');
        
    } catch (error) {
        console.error('❌ Simple test failed:', error);
    }
}

simpleTest(); 