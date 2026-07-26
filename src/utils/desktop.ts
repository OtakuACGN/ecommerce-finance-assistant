export function hasElectronAPI() {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'
}

function getElectronAPI() {
  if (!hasElectronAPI()) {
    throw new Error('当前为浏览器预览模式，请在桌面应用中运行后再执行文件读写操作')
  }
  return window.electronAPI
}

export async function openDataFiles() {
  return getElectronAPI().openFile()
}

export async function saveDataFile(defaultName: string) {
  return getElectronAPI().saveFile(defaultName)
}

export async function getDroppedFilePath(file: File) {
  return getElectronAPI().getDroppedFilePath(file)
}

export async function readLocalFile(filePath: string) {
  return getElectronAPI().readFile(filePath)
}

export async function writeLocalFile(filePath: string, data: string | ArrayBuffer) {
  return getElectronAPI().writeFile(filePath, data)
}

export function getBaseName(filePath: string) {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}
