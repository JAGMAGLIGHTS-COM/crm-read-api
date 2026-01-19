// api/refresh-data.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const JAGMAG_CONNECTOR_URL = process.env.JAGMAG_CONNECTOR_URL;
    const JAGMAG_ADMIN_SECRET = process.env.JAGMAG_ADMIN_SECRET;

    if (!JAGMAG_CONNECTOR_URL || !JAGMAG_ADMIN_SECRET) {
        return res.status(500).json({ error: 'Server configuration missing' });
    }

    // Helper: fetch and return JSON, but on failure include status + response body
    // so the CRM UI can display the real cause (401/403 from connector, etc.).
    async function fetchJsonOrThrow(url, phaseLabel) {
        const r = await fetch(url, {
            headers: { 'Authorization': `Bearer ${JAGMAG_ADMIN_SECRET}` }
        });

        if (!r.ok) {
            let body = '';
            try { body = await r.text(); } catch {}
            const msg = `${phaseLabel} failed: HTTP ${r.status}${body ? ` | ${body.slice(0, 800)}` : ''}`;
            const err = new Error(msg);
            err.status = r.status;
            err.phase = phaseLabel;
            throw err;
        }

        // Some upstream errors still return 200 with {success:false}; handle that at the callsite.
        return await r.json();
    }

    try {
        console.log('Starting AI data refresh...');
        
        // PHASE A: Policies (RESET)
        console.log('Phase A: Refreshing policies...');
        const phaseAResult = await fetchJsonOrThrow(
            `${JAGMAG_CONNECTOR_URL}/api/connector?admin=update-knowledge&kind=policies&offset=0&limit=50&reset=1`,
            'Phase A (policies)'
        );
        console.log(`Phase A: ${phaseAResult.items_curated || 0} items curated`);

        // PHASE B: Pages
        console.log('Phase B: Refreshing pages...');
        const phaseBResult = await fetchJsonOrThrow(
            `${JAGMAG_CONNECTOR_URL}/api/connector?admin=update-knowledge&kind=pages&offset=0&limit=50`,
            'Phase B (pages)'
        );
        console.log(`Phase B: ${phaseBResult.items_curated || 0} items curated`);

        // PHASE C: Products (batched loop)
        console.log('Phase C: Refreshing products...');
        let offset = 0;
        const limit = 10;
        const safetyCap = 2000;
        let zeroBatches = 0;
        let totalProducts = 0;

        while (offset < safetyCap && zeroBatches < 3) {
            const url = `${JAGMAG_CONNECTOR_URL}/api/connector?admin=update-knowledge&kind=products&offset=${offset}&limit=${limit}`;
            console.log(`Fetching products batch: offset=${offset}, limit=${limit}`);
            
            const result = await fetchJsonOrThrow(url, `Phase C (products) batch offset=${offset}`);
            const itemsCurated = result.items_curated || 0;
            
            console.log(`Batch ${offset/limit + 1}: ${itemsCurated} items curated`);
            
            totalProducts += itemsCurated;
            
            if (itemsCurated === 0) {
                zeroBatches++;
            } else {
                zeroBatches = 0;
            }
            
            offset += limit;
        }

        console.log(`Phase C complete: ${totalProducts} total products curated`);
        console.log(`Refresh completed successfully`);

        res.status(200).json({
            success: true,
            message: `Refresh completed: ${phaseAResult.items_curated || 0} policies, ${phaseBResult.items_curated || 0} pages, ${totalProducts} products`,
            summary: {
                policies: phaseAResult.items_curated || 0,
                pages: phaseBResult.items_curated || 0,
                products: totalProducts
            }
        });

    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            phase: error.phase || null,
            status: error.status || null
        });
    }
}
