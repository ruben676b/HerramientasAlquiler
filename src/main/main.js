const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { initDatabase } = require('./db/init');
const { registerIpcHandlers } = require('./ipcHandlers');
const { autoCancelarReservas, autoEliminarPapelera } = require('./services/contratoService');

const isDev = !app.isPackaged;

let mainWindow = null;
let forceQuit = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Intercept the window close to ask for confirmation in the renderer
  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault();
      mainWindow.webContents.send('close-requested');
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' }); // Desactivado: el usuario abre la consola manualmente si la necesita
  } else {
    mainWindow.loadFile(
      path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html')
    );
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  initDatabase();
  registerIpcHandlers();
  try { autoCancelarReservas(); } catch (e) { console.error('[autoCancelarReservas] Error:', e.message); }
  try { autoEliminarPapelera(); } catch (e) { console.error('[autoEliminarPapelera] Error:', e.message); }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// When the renderer confirms close, force quit
ipcMain.on('force-quit', () => {
  forceQuit = true;
  app.quit();
});
