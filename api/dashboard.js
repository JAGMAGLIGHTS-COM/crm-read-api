// api/dashboard.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Database configuration missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    try {
        // Run multiple queries in parallel
        const [
            { count: totalConvos },
            { count: totalCustomers },
            { data: priorityConvos },
            { data: recentActivity },
            { data: businessMetrics },
            { data: customerInsights },
            { data: orderAnalytics }
        ] = await Promise.all([
            supabase.from('conversations').select('*', { count: 'exact', head: true }),
            supabase.from('customer_profiles').select('*', { count: 'exact', head: true }),
            supabase.from('conversations').select('*').or('is_priority.eq.true,needs_human.eq.true'),
            supabase.from('daily_analytics').select('*').order('date', { ascending: false }).limit(7),
            supabase.from('conversation_analytics').select('*').order('date', { ascending: false }).limit(1),
            supabase.from('customer_profiles').select('message_count, conversation_count, last_seen'),
            supabase.from('order_references').select('*').order('order_date', { ascending: false }).limit(100)
        ]);

        // Process data
        const priorityCount = new Set(priorityConvos?.map(c => c.user_id)).size;
        const activeToday = recentActivity?.[0]?.unique_users || 0;
        const avgResponseTime = recentActivity?.[0]?.avg_response_time_ms || 0;
        const successRate = recentActivity?.[0]?.ai_success_rate || 0;

        // Calculate customer engagement score
        const totalMessages = customerInsights?.reduce((sum, c) => sum + (c.message_count || 0), 0) || 0;
        const avgMessages = totalCustomers > 0 ? (totalMessages / totalCustomers).toFixed(1) : 0;

        // Calculate order metrics
        const totalOrders = orderAnalytics?.length || 0;
        const pendingOrders = orderAnalytics?.filter(o => 
            o.order_data?.status === 'pending' || o.order_data?.fulfillment_status === 'unfulfilled'
        ).length || 0;
        const totalValue = orderAnalytics?.reduce((sum, o) => sum + (parseFloat(o.order_data?.total_price) || 0), 0) || 0;
        const avgOrderValue = totalOrders > 0 ? (totalValue / totalOrders).toFixed(0) : 0;

        res.status(200).json({
            overview: {
                totalConversations: totalConvos || 0,
                totalCustomers: totalCustomers || 0,
                activeToday,
                priorityCount,
                avgResponseTime,
                successRate
            },
            business: businessMetrics?.[0] || {},
            customers: {
                newCustomers7d: 0, // You'd need to calculate this
                returningCustomers: 0,
                avgMessages,
                engagementScore: Math.min(Math.round(avgMessages * 10), 100)
            },
            orders: {
                totalOrders,
                pendingOrders,
                avgOrderValue,
                recentOrders7d: 0
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
}
