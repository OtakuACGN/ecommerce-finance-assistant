/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    openFile: () => Promise<{
      canceled: boolean
      filePaths: string[]
    }>
    saveFile: (defaultName: string) => Promise<{
      canceled: boolean
      filePath?: string
    }>
    getDroppedFilePath: (file: File) => Promise<string>
    readFile: (filePath: string) => Promise<{
      success: boolean
      buffer?: ArrayBuffer
      error?: string
    }>
    writeFile: (filePath: string, data: string | ArrayBuffer) => Promise<{
      success: boolean
      error?: string
    }>
  }
}
