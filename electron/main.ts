import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import fs from 'fs'

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})

const isDev = !!process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f4f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: '电商财务经营助手',
    icon: path.join(__dirname, '../public/icon.png'),
  })

  // 精简菜单（保留复制粘贴）
  const menu = Menu.buildFromTemplate([
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'togglefullscreen', label: '全屏' },
        ...(isDev
          ? ([{ role: 'toggleDevTools', label: '开发者工具' }] as const)
          : []),
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    title: '导入数据文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '数据文件', extensions: ['csv', 'xlsx', 'xls', 'json'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  return result
})

ipcMain.handle('dialog:saveFile', async (_, defaultName: string) => {
  const ext = String(defaultName || '')
    .split('.')
    .pop()
    ?.toLowerCase()
  const filters =
    ext === 'json'
      ? [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ]
      : ext === 'csv'
        ? [
            { name: 'CSV 文件', extensions: ['csv'] },
            { name: 'Excel 文件', extensions: ['xlsx'] },
            { name: '所有文件', extensions: ['*'] },
          ]
        : [
            { name: 'Excel 文件', extensions: ['xlsx'] },
            { name: 'CSV 文件', extensions: ['csv'] },
            { name: 'JSON 文件', extensions: ['json'] },
            { name: '所有文件', extensions: ['*'] },
          ]
  const result = await dialog.showSaveDialog({
    title: '导出文件',
    defaultPath: defaultName,
    filters,
  })
  return result
})

ipcMain.handle('file:read', async (_, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath)
    return {
      success: true,
      buffer: buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('file:write', async (_, filePath: string, data: string | ArrayBuffer) => {
  try {
    if (typeof data === 'string') {
      fs.writeFileSync(filePath, data, 'utf8')
    } else {
      const buf = Buffer.from(new Uint8Array(data as ArrayBuffer))
      fs.writeFileSync(filePath, buf)
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
