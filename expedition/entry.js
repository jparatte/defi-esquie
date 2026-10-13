import { continuation } from '../continuation-config.js?v=2';
import { hasAccess } from '../continuation-access.js';

let allowed = false;
try { allowed = hasAccess(sessionStorage, continuation.passwordHash); }
catch { /* Browser storage is unavailable: keep the expedition locked. */ }

if (allowed) await import('./app.js?v=3');
else location.replace('../');
