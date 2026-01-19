/**
 * Simple authentication helper (optional)
 * Not used in the simplified version, but kept for compatibility
 */

export function requireAuth(req, res) {
    // For simplified version, we're not requiring auth on the API
    // This is kept for backward compatibility
    return { sub: 'crm-user' };
}

// Simple token validation (not really needed in simplified version)
export function verifyToken(token) {
    if (token && token.startsWith('crm-auth-')) {
        return { ok: true, payload: { sub: 'crm-user' } };
    }
    return { ok: false, reason: 'invalid_token' };
}
