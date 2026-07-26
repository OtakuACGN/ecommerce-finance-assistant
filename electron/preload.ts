import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  getDroppedFilePath: (file: File) => {
    const filePath = webUtils.getPathForFile(file)
    return ipcRenderer.invoke('file:authorizeDropped', filePath)
  },
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, data: string | ArrayBuffer) => ipcRenderer.invoke('file:write', filePath, data),
})
