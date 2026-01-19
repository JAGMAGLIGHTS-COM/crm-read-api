// api/customer.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Database configuration missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    try {
        // Get customer profile
        const { data: profile, error: profileError } = await supabase
            .from('customer_profiles')
            .select('*')
            .eq('user_id', user_id)
            .single();

        // Get customer's orders
        const { data: orders, error: ordersError } = await supabase
            .from('order_references')
            .select('*')
            .eq('customer_identifier', user_id)
            .order('order_date', { ascending: false })
            .limit(5);

        // Get recent conversations
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })
            .limit(10);

        // Surface query errors (helps debug RLS / missing tables quickly)
        if (profileError) console.error('Profile query error:', profileError);
        if (ordersError) console.error('Orders query error:', ordersError);
        if (convError) console.error('Conversations query error:', convError);

        res.status(200).json({
            profile: profile || {},
            orders: orders || [],
            conversations: conversations || []
        });
    } catch (error) {
        console.error('Customer data error:', error);
        res.status(500).json({ error: 'Failed to load customer data' });
    }
}
