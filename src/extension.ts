import * as vscode from 'vscode'
import TreeProvider from './treeProvider'
import { Controller } from './controller';

export function activate(context: vscode.ExtensionContext) {
  console.log('Snapshot Active!')

  const controller = new Controller()
  const treeProvider = new TreeProvider(context, controller)

  context.subscriptions.push(vscode.window.registerTreeDataProvider('snapshot', treeProvider))

  // save snapshot
  vscode.commands.registerTextEditorCommand('snapshot.save', treeProvider.save, treeProvider)

  vscode.commands.registerCommand('snapshot.selectItem', treeProvider.selectItem, treeProvider)

  vscode.commands.registerCommand('snapshot.deleteItem', treeProvider.deleteItem, treeProvider)

  // 同步快照 palette
  vscode.commands.registerCommand('snapshot.syncFile', treeProvider.syncFile, treeProvider)
  // 同步快照 按钮
  vscode.commands.registerCommand('snapshot.sync', treeProvider.syncFile, treeProvider)

  // 删除快照文件 palette
  vscode.commands.registerCommand('snapshot.deleteFile', treeProvider.deleteFile, treeProvider)
  // 删除快照文件 按钮
  vscode.commands.registerCommand('snapshot.delete', treeProvider.deleteFile, treeProvider)

  // 清空快照 palette
  vscode.commands.registerCommand('snapshot.clearAll', treeProvider.clear, treeProvider)
  // 清空快照 按钮
  vscode.commands.registerCommand('snapshot.clear', treeProvider.clear, treeProvider)

  // vscode.window.createTreeView('snapshot', {
  //   treeDataProvider: treeProvider,
  //   showCollapseAll: true
  // })

  // 切换文件触发
  vscode.window.onDidChangeActiveTextEditor(
    () => treeProvider.changeActiveFile()
  )

  // 设置修改
  vscode.workspace.onDidChangeConfiguration(configurationChangeEvent => {
    // 容器改变
    if (configurationChangeEvent.affectsConfiguration('snapshot.treeLocation')) {
      controller.updateTreeLocation()
    }

    // .snapshot位置改变
    if (configurationChangeEvent.affectsConfiguration('snapshot.path')) {
      controller.updateSnapshotFolder()
    }
  })
}

export function deactivate() {}
