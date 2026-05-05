import * as vscode from 'vscode'
import { Controller, getIcon } from './controller'
import { formatTime, cloneMap, getErrorMessage } from './utils'

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

  async getChildren(_element?: SnapshotItem): Promise<SnapshotItem[]> {
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
          title: vscode.l10n.t('Restore this snapshot'),
          arguments: [key]
        }
        tree.push(item)
      }
    } else {
      const item = new vscode.TreeItem(vscode.l10n.t('None'))
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
    if (!this.activeFile) {
      return
    }

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

    if (!doc || doc.uri.scheme !== 'file') {
      vscode.window.showErrorMessage(vscode.l10n.t('Snapshot can only be saved for local files.'))
      return
    }

    const ibo = <vscode.InputBoxOptions>{
      prompt: vscode.l10n.t('Snapshot Label'),
      placeHolder: vscode.l10n.t('Type the label for your snapshot')
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

      vscode.window.showInformationMessage(vscode.l10n.t('Snapshot is created!'))
      this.refresh()
    } catch (err) {
      this.tree.delete(id)
      vscode.window.showErrorMessage(getErrorMessage(err))
    }
  }

  // 恢复快照
  public selectItem(id: string) {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }

    const snapshot = this.tree.get(id)
    if (!snapshot) {
      vscode.window.showErrorMessage(vscode.l10n.t('Snapshot no longer exists.'))
      return
    }

    const position = editor.selection.active
    const line = Math.min(snapshot.position.line, editor.document.lineCount - 1)
    const newPosition = position.with(line, 0)
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
    this.controller.deleteSnapshotItem(this.activeFile, this.tree).then(() => {
      this.updateCache()
      this.refresh()
    }).catch(err => {
      vscode.window.showErrorMessage(vscode.l10n.t('Delete failed: {0}', getErrorMessage(err)))
    })
  }

  // 同步快照缓存
  public async syncFile() {
    if (!this.activeFile) {
      this.tree.clear()
      this.refresh()
      return
    }

    this.tree = await this.controller.getSnapshotContent(this.activeFile)
    this.updateCache()
    this.refresh()
  }

  // 删除快照文件
  public deleteFile() {
    if (!this.activeFile) {
      return
    }

    const message = vscode.l10n.t('Delete this file\'s snapshots')
    const yes = vscode.l10n.t('Yes')
    const no = vscode.l10n.t('No')

    vscode.window
      .showInformationMessage(message, { modal: true }, yes, no)
      .then(res => {
        if (res === yes) {
          this.controller
            .deleteSnapshotFile(this.activeFile)
            .then(() => {
              this.tree.clear()
              this.updateCache()
              this.refresh()
            })
            .catch(err => {
              vscode.window.showErrorMessage(vscode.l10n.t('Delete failed: {0}', getErrorMessage(err)))
            })
        }
      })
  }

  // 清空所有快照
  public clear() {
    if (!this.activeFile) {
      return
    }

    const message = vscode.l10n.t('Delete all files\'s snapshots')
    const yes = vscode.l10n.t('Yes')
    const no = vscode.l10n.t('No')
    vscode.window
      .showInformationMessage(message, { modal: true }, yes, no)
      .then(res => {
        if (res === yes) {
          this.controller
            .clear(this.activeFile)
            .then(() => {
              this.tree.clear()
              this.cache.clear()
              this.refresh()
            })
            .catch(err => {
              vscode.window.showErrorMessage(vscode.l10n.t('Clear failed: {0}', getErrorMessage(err)))
            })
        }
      })
  }

  // 更新树
  public refresh() {
    this._onDidChangeTreeData.fire(undefined)
  }
}

class SnapshotItem extends vscode.TreeItem {
  constructor(label: string = '') {
    super(label)
  }
}
