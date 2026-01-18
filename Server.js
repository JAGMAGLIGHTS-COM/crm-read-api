import { createServer } from 'http';
import { parse } from 'url';

// Import your handlers
import loginHandler from './login.js';
import conversationsHandler from './conversations.js';

const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    const { pathname } = parsedUrl;
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Parse request body
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    
    req.on('end', async () => {
        try {
            // Attach parsed URL and body to request
            req.url = parsedUrl;
            req.body = body;
            
            // Route requests
            if (pathname === '/api/login' && req.method === 'POST') {
                await loginHandler(req, res);
            } else if (pathname === '/api/conversations' && req.method === 'GET') {
                await conversationsHandler(req, res);
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        } catch (error) {
            console.error('Server error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CRM API server running on port ${PORT}`);
});
