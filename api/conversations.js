import { createClient } from "@supabase/supabase-js";

/**
 * Simple conversations endpoint (no complex auth)
 * GET /api/conversations
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get Supabase credentials
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            console.error('Missing Supabase credentials');
            return res.status(500).json({ 
                error: 'Database configuration missing',
                rows: [] 
            });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Parse query parameters
        const host = req.headers?.host || 'localhost';
        const url = new URL(req.url, `http://${host}`);
        const since = url.searchParams.get('since');
        const limit = parseInt(url.searchParams.get('limit') || '1000');
        const userId = url.searchParams.get('user_id');
        const channel = url.searchParams.get('channel');
        const order = url.searchParams.get('order') || 'desc';

        // Build query
        let query = supabase
            .from('conversations')
            .select('memory_id, channel, user_id, role, message, intent, conversation_state, entities, is_priority, needs_human, created_at')
            .order('created_at', { ascending: order === 'asc' })
            .limit(Math.min(limit, 2000));

        if (since) {
            query = query.gt('created_at', since);
        }
        if (userId) {
            query = query.eq('user_id', userId);
        }
        if (channel) {
            query = query.eq('channel', channel);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ 
                error: error.message,
                rows: [] 
            });
        }

        const rows = data || [];
        
        // Get newest timestamp for cursor
        let newestCreatedAt = null;
        if (rows.length > 0) {
            const timestamps = rows.map(row => new Date(row.created_at).getTime());
            const newestIndex = timestamps.indexOf(Math.max(...timestamps));
            newestCreatedAt = rows[newestIndex].created_at;
        }

        // Send response
        return res.status(200).json({
            rows,
            cursor: { newestCreatedAt },
            count: rows.length
        });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            rows: [] 
        });
    }
}
