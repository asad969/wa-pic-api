const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

let sock = null;
let isConnected = false;
let qrBase64 = null;
const logger = pino({ level: 'silent' });

async function startSocket() {
    const { state, saveCreds } = await useMultiFileAuthState('/app/auth_session');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: true,
        browser: ['WA-Pic-API', 'Chrome', '120.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n========== SCAN THIS QR CODE ==========');
            console.log('Go to: http://YOUR-SERVICE-URL/qr');
            console.log('=======================================\n');
            try {
                qrBase64 = await QRCode.toDataURL(qr);
            } catch (e) {
                qrBase64 = null;
            }
        }

        if (connection === 'open') {
            isConnected = true;
            qrBase64 = null;
            console.log('âœ… WhatsApp Connected! Service ready.');
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const loggedOut = statusCode === DisconnectReason.loggedOut;
            console.log('Connection closed. Status:', statusCode, '| Reconnect:', !loggedOut);
            if (!loggedOut) {
                setTimeout(startSocket, 5000);
            } else {
                console.log('Logged out. Please restart and scan QR again.');
                qrBase64 = null;
            }
        }
    });
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        connected: isConnected,
        waiting_for_qr: !isConnected && !!qrBase64
    });
});

// QR Code page â€” open in browser to scan
app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.send('<h2>âœ… Already Connected to WhatsApp!</h2>');
    }
    if (!qrBase64) {
        return res.send('<h2>â³ QR not ready yet. Refresh in 5 seconds...</h2><script>setTimeout(()=>location.reload(),5000)</script>');
    }
    res.send(`
        <html>
        <head><title>WA Pic API - Scan QR</title></head>
        <body style="text-align:center;font-family:sans-serif;padding:40px">
            <h2>ðŸ“± Scan with WhatsApp to Connect</h2>
            <p>Open WhatsApp â†’ Settings â†’ Linked Devices â†’ Link a Device</p>
            <img src="${qrBase64}" style="width:300px;height:300px" />
            <p><small>Page auto-refreshes every 10 seconds</small></p>
            <script>setTimeout(()=>location.reload(),10000)</script>
        </body>
        </html>
    `);
});

// Main endpoint: GET /:phone â†’ returns { url: "..." }
app.get('/:phone', async (req, res) => {
    if (!isConnected) {
        return res.status(503).json({ url: null, error: 'WhatsApp not connected. Visit /qr to scan.' });
    }

    try {
        const phone = req.params.phone.replace(/[^0-9]/g, '');
        if (!phone || phone.length < 7) {
            return res.status(400).json({ url: null, error: 'Invalid phone number' });
        }

        const jid = `${phone}@s.whatsapp.net`;
        const url = await sock.profilePictureUrl(jid, 'image');
        return res.json({ url: url || null });

    } catch (err) {
        // Privacy blocked or no picture â€” not an error, just return null
        return res.json({ url: null });
    }
});

startSocket();

app.listen(PORT, () => {
    console.log(`ðŸš€ wa-pic-api running on port ${PORT}`);
    console.log('Waiting for WhatsApp QR scan...');
});
