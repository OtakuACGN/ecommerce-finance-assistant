import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  type IpcMainInvokeEvent,
} from 'electron'
import path from 'path'
import fs from 'fs'

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})

const isDev = !!process.env.VITE_DEV_SERVER_URL
const trustedWebContentsIds = new Set<number>()
const readablePaths = new Set<string>()
const writablePaths = new Set<string>()
const readableExtensions = new Set(['.csv', '.xlsx', '.xls', '.json'])
const writableExtensions = new Set(['.csv', '.xlsx', '.json'])

function normalizedPath(filePath: string) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('文件路径为空')
  }
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  if (!trustedWebContentsIds.has(event.sender.id)) {
    throw new Error('拒绝未授权的窗口请求')
  }
}

function assertAllowedExtension(filePath: string, allowed: Set<string>) {
  if (!allowed.has(path.extname(filePath).toLocaleLowerCase())) {
    throw new Error('不支持的文件类型')
  }
}

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
      sandbox: true,
      webSecurity: true,
    },
    title: '店财通',
    icon: path.join(__dirname, '../public/icon.png'),
  })
  const trustedId = win.webContents.id
  trustedWebContentsIds.add(trustedId)
  win.on('closed', () => trustedWebContentsIds.delete(trustedId))
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== win.webContents.getURL()) event.preventDefault()
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

ipcMain.handle('dialog:openFile', async (event) => {
  assertTrustedSender(event)
  const result = await dialog.showOpenDialog({
    title: '导入数据文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '数据文件', extensions: ['csv', 'xlsx', 'xls', 'json'] },
    ],
  })
  for (const filePath of result.filePaths) {
    assertAllowedExtension(filePath, readableExtensions)
    readablePaths.add(normalizedPath(filePath))
  }
  return result
})

ipcMain.handle('dialog:saveFile', async (event, defaultName: string) => {
  assertTrustedSender(event)
  const ext = String(defaultName || '')
    .split('.')
    .pop()
    ?.toLowerCase()
  const filters =
    ext === 'json'
      ? [
          { name: 'JSON 文件', extensions: ['json'] },
        ]
      : ext === 'csv'
        ? [
            { name: 'CSV 文件', extensions: ['csv'] },
            { name: 'Excel 文件', extensions: ['xlsx'] },
          ]
        : [
            { name: 'Excel 文件', extensions: ['xlsx'] },
            { name: 'CSV 文件', extensions: ['csv'] },
            { name: 'JSON 文件', extensions: ['json'] },
          ]
  const result = await dialog.showSaveDialog({
    title: '导出文件',
    defaultPath: defaultName,
    filters,
  })
  if (!result.canceled && result.filePath) {
    assertAllowedExtension(result.filePath, writableExtensions)
    writablePaths.add(normalizedPath(result.filePath))
  }
  return result
})

ipcMain.handle(
  'file:authorizeDropped',
  async (event, filePath: string) => {
    assertTrustedSender(event)
    assertAllowedExtension(filePath, readableExtensions)
    readablePaths.add(normalizedPath(filePath))
    return filePath
  },
)

ipcMain.handle('file:read', async (event, filePath: string) => {
  try {
    assertTrustedSender(event)
    assertAllowedExtension(filePath, readableExtensions)
    if (!readablePaths.has(normalizedPath(filePath))) {
      throw new Error('请先通过“选择文件”或拖放授权读取该文件')
    }
    const buffer = await fs.promises.readFile(filePath)
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

ipcMain.handle('file:write', async (event, filePath: string, data: string | ArrayBuffer | Uint8Array | number[]) => {
  try {
    assertTrustedSender(event)
    assertAllowedExtension(filePath, writableExtensions)
    if (!writablePaths.has(normalizedPath(filePath))) {
      throw new Error('请先通过“保存文件”选择写入位置')
    }
    if (data == null) {
      return { success: false, error: '写入数据为空' }
    }
    if (typeof data === 'string') {
      await fs.promises.writeFile(filePath, data, 'utf8')
      return { success: true, bytes: Buffer.byteLength(data, 'utf8') }
    }
    let buf: Buffer
    if (Array.isArray(data)) {
      buf = Buffer.from(data as number[])
    } else if (data instanceof Uint8Array) {
      buf = Buffer.from(data)
    } else {
      buf = Buffer.from(new Uint8Array(data as ArrayBuffer))
    }
    if (!buf.length) {
      return { success: false, error: '写入数据长度为 0（可能是导出序列化失败）' }
    }
    await fs.promises.writeFile(filePath, buf)
    return { success: true, bytes: buf.length }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
