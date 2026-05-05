import * as vscode from 'vscode'

export class Settings {
  public getConfiguration() {
    const config = vscode.workspace.getConfiguration('snapshot')

    return {
      path: <string>config.get('path')
    }
  }
}
