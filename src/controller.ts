import * as vscode from 'vscode'

import fs = require('fs');
import path = require('path');
const { promisify } = require('util')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')

import { Settings } from './settings'
import { mapToJson, jsonToMap, } from './utils'

const writeFile = promisify(fs.writeFile)
const readdir = promisify(fs.readdir)
const rmdir = promisify(fs.rmdir)

// 获取图标
export const getIcon = (context: vscode.ExtensionContext): {dark: string, light: string} => {
  return {
    dark: context.asAbsolutePath(path.join('resources', 'dark', 'file.svg')),
    light: context.asAbsolutePath(path.join('resources', 'light', 'file.svg'))
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
    this.updateTreeLocation()
    this.updateSnapshotFolder()
  }

  // 更新容器
  updateTreeLocation() {
    const _location = this.settings.getConfiguration().treeLocation
    vscode.commands.executeCommand('setContext', 'snapshot:treeLocation', _location)
  }

  // 更新.snapshot位置
  updateSnapshotFolder() {
    const _path = this.settings.getConfiguration().path

    // 绝对路径和相对于工作目录的路径
    if (path.isAbsolute(_path)) {
      if (fs.existsSync(_path) && fs.statSync(_path)) {
        this.snapshotConfig = {
          type: 'absolute',
          dir: _path
        }
      } else {
        vscode.window.showErrorMessage('The specified path is invalid, replace with the default path.')
      }
    } else {
      this.snapshotConfig = {
        type: 'relative',
        dir: _path
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
    const wsName = vscode.workspace.name
    const { type, dir } = this.snapshotConfig
    let newPath = ''

    if (type === 'absolute') {
      newPath = path.join(dir, wsName, '.snapshot')
    } else {
      newPath = path.join(wsFolder, dir, '.snapshot')
    }

    // 如果
    if (this.snapshotPath && this.snapshotPath !== newPath) {
      const dirname = path.dirname(newPath)
      if (!fs.existsSync(dirname)) {
        // fs.mkdirSync(sn, { recursive: true })
        mkdirp.sync(dirname)
      }
      fs.rename(this.snapshotPath, newPath, (err) => {
        if (err) {
          vscode.window.showErrorMessage(err.message)
          return
        }
        vscode.window.showInformationMessage(`.snapshot have moved to "${dirname}"`)
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

    return vscode.workspace.openTextDocument(filePath).then((doc: vscode.TextDocument) => {
      let items = doc.getText()
      return jsonToMap(items)
    }, () => {
      return new Map()
    })
  }

  // 保存当前文件快照
  public async saveSnapshot(file: vscode.Uri, tree) {
    const snapshotPath = this.getSnapshotPath(file)
    const diranme = path.dirname(snapshotPath)

    if (!fs.existsSync(diranme)) {
      // fs.mkdirSync(diranme, { recursive: true })
      mkdirp.sync(diranme)
    }

    await writeFile(snapshotPath, mapToJson(tree))
  }

  // 删除快照条目
  public deleteSnapshotItem(file: vscode.Uri, tree) {
    if (tree.size) {
      this.saveSnapshot(file, tree)
    } else {
      this.deleteSnapshotFile(file)
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
      vscode.window.showErrorMessage(err.message)
    }
  }

  // 删除文件快照
  public deleteSnapshotFile(file: vscode.Uri) {
    const filePath = this.getSnapshotPath(file)
    return new Promise((resolve, reject) => {
      fs.unlink(filePath, err => {
        if (err) {
          return reject(err)
        }
        this.removeEmptyDir(path.dirname(filePath))
        return resolve()
      })
    })
  }

  // 删除全部快照文件
  public clear(file: vscode.Uri) {
    // const snapshotFolder = this.getSnapshotFolder(file)
    const snapshotFolder = this.snapshotPath
    return new Promise((resolve, reject) => {
      rimraf(snapshotFolder, err => {
        if (err) {
          return reject(err)
        }
        return resolve()
      })
    })
  }
}
