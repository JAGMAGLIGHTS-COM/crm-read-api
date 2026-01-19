/**
 * Simple login endpoint
 * POST /api/login
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Parse request body
        let body;
        try {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON in request body' });
        }

        const { password } = body || {};
        
        // Get expected password from environment or use default
        const expectedPassword = process.env.CRM_PASSWORD || '2211';
        
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }
        
        if (password === expectedPassword) {
            // Return a simple success response
            return res.status(200).json({ 
                success: true,
                token: `crm-auth-${Date.now()}`,
                message: 'Login successful'
            });
        } else {
            return res.status(401).json({ error: 'Invalid password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
