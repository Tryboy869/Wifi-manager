// ═══════════════════════════════════════════════════════════════
// WIFI MANAGER BACKEND - Node.js Minimal
// Communication avec routeur Huawei HG8145V6
// ═══════════════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

// Configuration Routeur
const ROUTER_CONFIG = {
    host: '192.168.100.1',
    username: 'root',
    password: 'RgPCN9wU',
    port: 80
};

// État de la session routeur
let routerSession = {
    cookie: null,
    lastAuth: null
};

// ═══════════════════════════════════════════════════════════════
// COMMUNICATION ROUTEUR HUAWEI
// ═══════════════════════════════════════════════════════════════

/**
 * Authentification sur le routeur Huawei
 */
async function authenticateRouter() {
    return new Promise((resolve, reject) => {
        const password = crypto
            .createHash('sha256')
            .update(ROUTER_CONFIG.password)
            .digest('base64');

        const postData = querystring.stringify({
            UserName: ROUTER_CONFIG.username,
            Password: password
        });

        const options = {
            hostname: ROUTER_CONFIG.host,
            port: ROUTER_CONFIG.port,
            path: '/asp/GetRandCount.asp',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.headers['set-cookie']) {
                    routerSession.cookie = res.headers['set-cookie'][0];
                    routerSession.lastAuth = Date.now();
                    console.log('✅ Authentification routeur réussie');
                    resolve(true);
                } else {
                    console.error('❌ Échec authentification routeur');
                    reject(new Error('Authentication failed'));
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ Erreur connexion routeur:', error.message);
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Vérifier si la session est valide (< 10 minutes)
 */
function isSessionValid() {
    if (!routerSession.cookie || !routerSession.lastAuth) {
        return false;
    }
    const sessionAge = Date.now() - routerSession.lastAuth;
    return sessionAge < 10 * 60 * 1000; // 10 minutes
}

/**
 * Activer l'accès WiFi pour un code validé
 * Note: Cette fonction devra être adaptée selon l'interface spécifique
 * du routeur Huawei HG8145V6
 */
async function activateWiFiAccess(code) {
    // Vérifier session
    if (!isSessionValid()) {
        await authenticateRouter();
    }

    // IMPORTANT: Cette partie dépend de l'interface du routeur
    // Options possibles:
    // 1. Ajouter une règle de filtrage MAC
    // 2. Activer temporairement le réseau invité
    // 3. Modifier la configuration WLAN

    console.log(`🌐 Activation WiFi pour code: ${code}`);

    // Exemple générique (à adapter)
    return new Promise((resolve, reject) => {
        const options = {
            hostname: ROUTER_CONFIG.host,
            port: ROUTER_CONFIG.port,
            path: '/html/wlan/wlanconfig.asp', // Chemin à adapter
            method: 'POST',
            headers: {
                'Cookie': routerSession.cookie,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('✅ WiFi activé avec succès');
                    resolve({ success: true, code: code });
                } else {
                    console.error('❌ Échec activation WiFi');
                    reject(new Error('WiFi activation failed'));
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ Erreur activation WiFi:', error.message);
            reject(error);
        });

        // Données à envoyer (à adapter selon routeur)
        const postData = querystring.stringify({
            'wlan_enable': '1',
            'guest_access': '1'
        });

        req.write(postData);
        req.end();
    });
}

// ═══════════════════════════════════════════════════════════════
// SERVEUR HTTP - API
// ═══════════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
    // CORS Headers pour communication avec HTML
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight request
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Logging
    console.log(`${req.method} ${req.url}`);

    // Route: Health check
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            router_connected: isSessionValid(),
            timestamp: Date.now()
        }));
        return;
    }

    // Route: Activer WiFi avec code
    if (req.url === '/activate' && req.method === 'POST') {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const code = data.code;

                if (!code) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Code manquant' }));
                    return;
                }

                // Tenter activation WiFi
                const result = await activateWiFiAccess(code);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    message: 'WiFi activé',
                    code: code 
                }));

            } catch (error) {
                console.error('Erreur activation:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'Échec activation WiFi',
                    details: error.message 
                }));
            }
        });

        return;
    }

    // Route: Test connexion routeur
    if (req.url === '/test-router' && req.method === 'GET') {
        try {
            await authenticateRouter();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true, 
                message: 'Connexion routeur OK' 
            }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: false, 
                error: error.message 
            }));
        }
        return;
    }

    // Route non trouvée
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route non trouvée' }));
});

// ═══════════════════════════════════════════════════════════════
// DÉMARRAGE SERVEUR
// ═══════════════════════════════════════════════════════════════

const PORT = 3000;

server.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 WiFi Manager Backend - DÉMARRÉ');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📡 Serveur: http://localhost:${PORT}`);
    console.log(`🌐 Routeur: ${ROUTER_CONFIG.host}`);
    console.log('\n📋 Routes disponibles:');
    console.log('  GET  /health        - État du serveur');
    console.log('  GET  /test-router   - Test connexion routeur');
    console.log('  POST /activate      - Activer WiFi avec code');
    console.log('\n⚠️  IMPORTANT:');
    console.log('  - Vérifiez que le routeur est accessible');
    console.log('  - Adaptez la fonction activateWiFiAccess() selon votre routeur');
    console.log('  - Ouvrez index.html dans votre navigateur');
    console.log('═══════════════════════════════════════════════════════\n');

    // Test connexion initiale
    authenticateRouter()
        .then(() => console.log('✅ Connexion initiale routeur réussie\n'))
        .catch((error) => console.error('❌ Échec connexion initiale:', error.message, '\n'));
});

// Gestion arrêt propre
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt du serveur...');
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
});
</parameter>
</invoke>