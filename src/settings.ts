import * as vscode from 'vscode'
import path = require('path')

const enum ESnapshotTreeLocation {
  Explorer = 0,
  Snapshot
}

export class Settings {
  public getConfiguration() {
    const config = vscode.workspace.getConfiguration('snapshot')

    return {
      treeLocation: <ESnapshotTreeLocation>config.get('treeLocation'),
      path: <string>config.get('path')
    }
  }
}
