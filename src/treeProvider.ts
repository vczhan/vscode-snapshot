import * as vscode from 'vscode'
import { Controller, getIcon } from './controller'
import { formatTime, cloneMap } from './utils'

// interface ITree {
//   [key: string]: string
// }

export default class TreeProvider
  implements vscode.TreeDataProvider<SnapshotItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    SnapshotItem | undefined
  > = new vscode.EventEmitter<SnapshotItem | undefined>()
  readonly onDidChangeTreeData: vscode.Event<SnapshotItem | undefined> = this
    ._onDidChangeTreeData.event

  private activeFile: vscode.Uri
  private activeFilePath: string
  private tree  // : Map<string, ITree>
  private cache // : Map<string, object>

  constructor(private context: vscode.ExtensionContext, private controller: Controller) {
    this.context = context
    this.tree = new Map()
    this.cache = new Map()
    this.initLocation()
  }

  initLocation() {
    this.updateActiveFile()
    this.updateTree()
  }

  getTreeItem(element: SnapshotItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: SnapshotItem): Promise<SnapshotItem[]> {
    let tree = []

    if (this.tree.size) {
      for (let [key, { desc }] of this.tree) {
        const item = new SnapshotItem()
        item.id = key
        item.iconPath = getIcon(this.context)
        item.label = `[${formatTime(+key, 'hh:mm')}] ${desc}`
        item.tooltip = `${desc} [${formatTime(+key, 'MM-DD hh:mm')}]`
        item.command = {
          command: 'snapshot.selectItem',
          title: 'Restore this snapshot',
          arguments: [key]
        }
        tree.push(item)
      }
    } else {
      const item = new vscode.TreeItem('None')
      item.contextValue = 'None'
      tree.push(item)
    }
    return tree
  }

  updateActiveFile() {
    const editor = vscode.window.activeTextEditor
    if (editor) {
      const file = editor.document.uri
      this.activeFile = file
      this.activeFilePath = this.controller.getRelativePath(file)
    } else {
      this.activeFile = null
      this.activeFilePath = ''
    }
  }

  // 更新缓存
  updateCache() {
    const fileName = this.controller.getRelativePath(this.activeFile)

    if (this.tree.size) {
      this.cache.set(fileName, cloneMap(this.tree))
    } else {
      this.cache.delete(fileName)
    }
  }

  // 更新树
  async updateTree() {
    if (!this.activeFile) {
      this.tree.clear()
      this.refresh()
      return
    }

    const fileName = this.activeFilePath

    // 如果已缓存，则直接从缓存读取，否者从快照文件读取
    if (this.cache.has(fileName)) {
      this.tree = cloneMap(this.cache.get(fileName))
    } else {
      this.tree = await this.controller.getSnapshotContent(this.activeFile)

      if (this.tree.size) {
        this.updateCache()
      }
    }

    this.refresh()
  }

  // tab切换触发
  public changeActiveFile() {
    this.updateActiveFile()
    this.updateTree()
  }

  // 保存快照
  async save(textEditor: vscode.TextEditor) {
    const doc = textEditor.document

    if (!doc) return

    const ibo = <vscode.InputBoxOptions>{
      prompt: 'Snapshot Label',
      placeHolder: 'Type the label for your snapshot'
    }

    const desc = await vscode.window.showInputBox(ibo)

    if (!desc) return

    const id = Date.now().toString()
    const value = doc.getText()
    const position = textEditor.selection.active

    this.tree.set(id, {
      desc: desc.trim() || 'undefined',
      value,
      position
    })

    try {
      const file = doc.uri
      await this.controller.saveSnapshot(file, this.tree)
      this.updateCache()

      vscode.window.showInformationMessage('Snapshot is created!')
      this.refresh()
    } catch (err) {
      this.tree.delete(id)
      vscode.window.showErrorMessage(err.message)
    }
  }

  // 恢复快照
  public selectItem(id: string) {
    const editor = vscode.window.activeTextEditor
    const snapshot = this.tree.get(id)
    const position = editor.selection.active
    const newPosition = position.with(snapshot.position.line, 0)
    const newSelection = new vscode.Selection(newPosition, newPosition)

    // TODO: 恢复光标位置
    editor.edit(editBuilder => {
      const end = new vscode.Position(editor.document.lineCount + 1, 0)
      editBuilder.replace(new vscode.Range(new vscode.Position(0, 0), end), snapshot.value)
      editor.revealRange(newSelection, vscode.TextEditorRevealType.Default)
      editor.selection = newSelection
    })
  }

  // 删除单条
  public deleteItem({ id }) {
    this.tree.delete(id)
    this.controller.deleteSnapshotItem(this.activeFile, this.tree)
    this.updateCache()
    this.refresh()
  }

  // 同步快照缓存
  public async syncFile() {
    this.tree = await this.controller.getSnapshotContent(this.activeFile)
    this.updateCache()
    this.refresh()
  }

  // 删除快照文件
  public deleteFile() {
    const message = 'Delete this file\'s snapshots'

    vscode.window
      .showInformationMessage(message, { modal: true }, 'Yes', 'No')
      .then(res => {
        if (res === 'Yes') {
          this.controller
            .deleteSnapshotFile(this.activeFile)
            .then(() => {
              this.refresh()
              this.tree.clear()
              this.updateCache()
            })
            .catch(err => {
              vscode.window.showErrorMessage(`Clear failed: ${TypeError}`)
            })
        }
      })
  }

  // 清空所有快照
  public clear() {
    const message = 'Delete all files\'s snapshots'
    vscode.window
      .showInformationMessage(message, { modal: true }, 'Yes', 'No')
      .then(res => {
        if (res === 'Yes') {
          this.controller
            .clear(this.activeFile)
            .then(() => {
              this.refresh()
              this.tree.clear()
              this.cache.clear()
            })
            .catch(err => {
              vscode.window.showErrorMessage(`Clear failed: ${TypeError}`)
            })
        }
      })
  }

  // 更新树
  public refresh() {
    this._onDidChangeTreeData.fire()
  }
}

class SnapshotItem extends vscode.TreeItem {
  constructor(label: string = '') {
    super(label)
  }
}
