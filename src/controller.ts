import * as vscode from 'vscode'

import fs = require('fs');
import path = require('path');

import { Settings } from './settings'
import { mapToJson, jsonToMap, getErrorMessage } from './utils'

const writeFile = fs.promises.writeFile
const readdir = fs.promises.readdir
const rmdir = fs.promises.rmdir

// 获取图标
export const getIcon = (context: vscode.ExtensionContext): {dark: vscode.Uri, light: vscode.Uri} => {
  return {
    dark: vscode.Uri.file(context.asAbsolutePath(path.join('resources', 'dark', 'file.svg'))),
    light: vscode.Uri.file(context.asAbsolutePath(path.join('resources', 'light', 'file.svg')))
  }
}

export class Controller {
  private snapshotPath: string
  private settings: Settings
  private snapshotConfig: {
    type: string,
    dir: string
  }

  constructor() {
    this.settings = new Settings()
    this.updateSnapshotFolder()
  }

  // 更新.snapshot位置
  updateSnapshotFolder() {
    const _path = (this.settings.getConfiguration().path || '').trim() || '.snapshot'

    // 绝对路径和相对于工作目录的路径
    if (path.isAbsolute(_path)) {
      this.snapshotConfig = {
        type: 'absolute',
        dir: path.normalize(_path)
      }
    } else {
      this.snapshotConfig = {
        type: 'relative',
        dir: path.normalize(_path)
      }
    }

    this.setSnapshotFolder()
  }

  // 获取文件相对于工作目录的路径
  public getRelativePath(file: vscode.Uri): string {
    return vscode.workspace.asRelativePath(file.fsPath, false)
  }

  // 获取工作目录
  private getWorkspaceFolder(file?: vscode.Uri): string {
    if (vscode.workspace.workspaceFolders) {
      if (file) {
        const wsFolder = vscode.workspace.getWorkspaceFolder(file)
        if (wsFolder) {
          return wsFolder.uri.fsPath
        }
      }
      return vscode.workspace.workspaceFolders[0].uri.fsPath
    }
  }

  // 设置快照目录
  private setSnapshotFolder() {
    const wsFolder = this.getWorkspaceFolder()
    const { type, dir } = this.snapshotConfig
    let newPath = ''

    if (type === 'absolute') {
      newPath = dir
    } else {
      if (!wsFolder) {
        this.snapshotPath = ''
        return
      }
      newPath = path.join(wsFolder, dir)
    }

    // 如果快照目录配置发生变化，则迁移已有目录。
    if (this.snapshotPath && this.snapshotPath !== newPath) {
      const dirname = path.dirname(newPath)
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true })
      }

      if (!fs.existsSync(this.snapshotPath)) {
        this.snapshotPath = newPath
        return
      }

      fs.rename(this.snapshotPath, newPath, (err) => {
        if (err) {
          vscode.window.showErrorMessage(getErrorMessage(err))
          return
        }
        vscode.window.showInformationMessage(vscode.l10n.t('.snapshot have moved to "{0}"', newPath))
      })
    }
    this.snapshotPath = newPath
  }

  // 获取快照目录
  // private getSnapshotFolder(file: vscode.Uri) {
  //   const wsFolder = this.getWorkspaceFolder(file)
  //   return path.join(wsFolder, '.snapshot')
  // }

  // 获取当前文件快照路径
  private getSnapshotPath(file: vscode.Uri) {
    if (!file || file.scheme !== 'file' || !this.snapshotPath) {
      return null
    }

    const filePath = file.fsPath
    // 排除.history文件和.snapshot文件
    if (/\/\.(history|snapshot)\//.test(filePath)) {
      return null
    }
    // 获取快照目录地址
    const snapshotPath = this.snapshotPath // this.getSnapshotFolder(file)

    // const relativePath = path.relative(wsPath, filePath)
    const relativePath = this.getRelativePath(file)

    // 返回快照地址
    return path.format({
      dir: snapshotPath,
      name: relativePath,
      ext: '.json'
    })
  }

  // 获取快照内容
  public getSnapshotContent(file: vscode.Uri) {
    const filePath = this.getSnapshotPath(file)

    if (!filePath) {
      return Promise.resolve(new Map())
    }

    return vscode.workspace.openTextDocument(filePath).then((doc: vscode.TextDocument) => {
      let items = doc.getText()
      try {
        return jsonToMap(items)
      } catch (err) {
        vscode.window.showErrorMessage(vscode.l10n.t('Read snapshot failed: {0}', getErrorMessage(err)))
        return new Map()
      }
    }, () => {
      return new Map()
    })
  }

  // 保存当前文件快照
  public async saveSnapshot(file: vscode.Uri, tree) {
    const snapshotPath = this.getSnapshotPath(file)
    if (!snapshotPath) {
      throw new Error(vscode.l10n.t('Snapshot can only be saved for files in a workspace.'))
    }
    const diranme = path.dirname(snapshotPath)

    if (!fs.existsSync(diranme)) {
      fs.mkdirSync(diranme, { recursive: true })
    }

    await writeFile(snapshotPath, mapToJson(tree))
  }

  // 删除快照条目
  public deleteSnapshotItem(file: vscode.Uri, tree) {
    if (tree.size) {
      return this.saveSnapshot(file, tree)
    } else {
      return this.deleteSnapshotFile(file)
    }
  }

  // 删除空目录
  public async removeEmptyDir(dirname) {
    try {
      const files = await readdir(dirname)
      if (!files.length) {
        await rmdir(dirname)
        this.removeEmptyDir(path.dirname(dirname))
      }
    } catch (err) {
      vscode.window.showErrorMessage(getErrorMessage(err))
    }
  }

  // 删除文件快照
  public deleteSnapshotFile(file: vscode.Uri): Promise<void> {
    const filePath = this.getSnapshotPath(file)
    if (!filePath) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      fs.unlink(filePath, err => {
        if (err) {
          if (err.code === 'ENOENT') {
            return resolve()
          }
          return reject(err)
        }
        this.removeEmptyDir(path.dirname(filePath))
        return resolve()
      })
    })
  }

  // 删除全部快照文件
  public clear(_file: vscode.Uri) {
    // const snapshotFolder = this.getSnapshotFolder(file)
    const snapshotFolder = this.snapshotPath
    return fs.promises.rm(snapshotFolder, { recursive: true, force: true })
  }
}
