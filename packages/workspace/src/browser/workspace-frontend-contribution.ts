/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { isOSX, isElectron } from '@theia/core';
import { open, OpenerService, CommonMenus, StorageService, LabelProvider, ConfirmDialog, KeybindingRegistry, KeybindingContribution } from '@theia/core/lib/browser';
import { FileDialogService, OpenFileDialogProps } from '@theia/filesystem/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { WorkspaceService, THEIA_EXT, VSCODE_EXT } from './workspace-service';
import { WorkspaceCommands } from './workspace-commands';
import { QuickOpenWorkspace } from './quick-open-workspace';
import { WorkspacePreferences } from './workspace-preferences';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class WorkspaceFrontendContribution implements CommandContribution, KeybindingContribution, MenuContribution {

    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(StorageService) protected readonly workspaceStorage: StorageService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(QuickOpenWorkspace) protected readonly quickOpenWorkspace: QuickOpenWorkspace;
    @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
    @inject(WorkspacePreferences) protected preferences: WorkspacePreferences;

    registerCommands(commands: CommandRegistry): void {
        // Not visible/enabled on Windows/Linux in electron.
        commands.registerCommand(WorkspaceCommands.OPEN, {
            isEnabled: () => isOSX || !isElectron(),
            isVisible: () => isOSX || !isElectron(),
            // tslint:disable-next-line:no-any
            execute: (args: any[]) => {
                if (args) {
                    const [fileURI] = args;
                    return this.workspaceService.open(fileURI);
                }
                return this.doOpen();
            }
        });
        // Visible/enabled only on Windows/Linux in electron.
        commands.registerCommand(WorkspaceCommands.OPEN_FILE, {
            isEnabled: () => !isOSX && isElectron(),
            isVisible: () => !isOSX && isElectron(),
            execute: () => this.doOpen({ canSelectFiles: true, canSelectFolders: false })
        });
        // Visible/enabled only on Windows/Linux in electron.
        commands.registerCommand(WorkspaceCommands.OPEN_FOLDER, {
            isEnabled: () => !isOSX && isElectron(),
            isVisible: () => !isOSX && isElectron(),
            execute: () => this.doOpen({ canSelectFiles: false, canSelectFolders: true })
        });
        commands.registerCommand(WorkspaceCommands.OPEN_WORKSPACE, {
            isEnabled: () => true,
            execute: () => this.openWorkspace()
        });
        commands.registerCommand(WorkspaceCommands.CLOSE, {
            isEnabled: () => this.workspaceService.opened,
            execute: () => this.closeWorkspace()
        });
        commands.registerCommand(WorkspaceCommands.OPEN_RECENT_WORKSPACE, {
            isEnabled: () => this.workspaceService.hasHistory,
            execute: () => this.quickOpenWorkspace.select()
        });
        commands.registerCommand(WorkspaceCommands.SAVE_WORKSPACE_AS, {
            isEnabled: () => this.workspaceService.isMultiRootWorkspaceOpened,
            execute: () => this.saveWorkspaceAs()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        if (isOSX || !isElectron()) {
            menus.registerMenuAction(CommonMenus.FILE_OPEN, {
                commandId: WorkspaceCommands.OPEN.id,
                order: 'a00'
            });
        }
        if (!isOSX && isElectron()) {
            menus.registerMenuAction(CommonMenus.FILE_OPEN, {
                commandId: WorkspaceCommands.OPEN_FILE.id,
                order: 'a01'
            });
            menus.registerMenuAction(CommonMenus.FILE_OPEN, {
                commandId: WorkspaceCommands.OPEN_FOLDER.id,
                order: 'a02'
            });
        }
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_WORKSPACE.id,
            order: 'a10'
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_RECENT_WORKSPACE.id,
            order: 'a20'
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.SAVE_WORKSPACE_AS.id,
            order: 'a30'
        });

        menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
            commandId: WorkspaceCommands.CLOSE.id
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: isOSX || !isElectron() ? WorkspaceCommands.OPEN.id : WorkspaceCommands.OPEN_FILE.id,
            keybinding: 'ctrlcmd+alt+o',
        });
        if (!isOSX && isElectron()) {
            keybindings.registerKeybinding({
                command: WorkspaceCommands.OPEN_FOLDER.id,
                keybinding: 'ctrl+k ctrl+o',
            });
        }
        keybindings.registerKeybinding({
            command: WorkspaceCommands.OPEN_WORKSPACE.id,
            keybinding: 'ctrlcmd+alt+w',
        });
        keybindings.registerKeybinding({
            command: WorkspaceCommands.OPEN_RECENT_WORKSPACE.id,
            keybinding: 'ctrlcmd+alt+r',
        });
    }

    protected doOpen(options?: Readonly<{ canSelectFolders?: boolean, canSelectFiles?: boolean }>): void {
        let props: OpenFileDialogProps = {
            title: WorkspaceCommands.OPEN.label!,
            canSelectFolders: true,
            canSelectFiles: true
        };
        if (options) {
            props = {
                ...props,
                ...options
            };
        }
        this.workspaceService.roots.then(async roots => {
            const uri = await this.fileDialogService.showOpenDialog(props, roots[0]);
            this.doOpenFileOrFolder(uri);
        });
    }

    protected doOpenFileOrFolder(uri: URI | undefined): void {
        if (!uri) {
            return;
        }
        this.fileSystem.getFileStat(uri.toString()).then(stat => {
            if (stat) {
                if (stat.isDirectory) {
                    this.workspaceService.open(uri);
                } else {
                    open(this.openerService, uri);
                }
            }
        });
    }

    protected async openWorkspace(): Promise<void> {
        const option: OpenFileDialogProps = {
            title: WorkspaceCommands.OPEN_WORKSPACE.label!,
            canSelectFiles: false,
            canSelectFolders: true,
        };
        await this.preferences.ready;
        if (this.preferences['workspace.supportMultiRootWorkspace']) {
            option.canSelectFiles = true;
            option.canSelectFolders = false;
            option.filters = {
                'Theia Workspace (*.theia-workspace)': [THEIA_EXT],
                'VS Code Workspace (*.code-workspace)': [VSCODE_EXT]
            };
        }
        const selected = await this.fileDialogService.showOpenDialog(option);
        if (selected) {
            // open the selected directory, or recreate a workspace from the selected file
            this.workspaceService.open(selected);
        }
    }

    protected async closeWorkspace(): Promise<void> {
        const dialog = new ConfirmDialog({
            title: WorkspaceCommands.CLOSE.label!,
            msg: 'Do you really want to close the workspace?'
        });
        if (await dialog.open()) {
            this.workspaceService.close();
        }
    }

    protected async saveWorkspaceAs(): Promise<void> {
        let exist: boolean = false;
        let overwrite: boolean = false;
        let selected: URI | undefined;
        do {
            selected = await this.fileDialogService.showSaveDialog({
                title: WorkspaceCommands.SAVE_WORKSPACE_AS.label!,
                filters: {
                    'Theia Workspace (*.theia-workspace)': [THEIA_EXT],
                    'VS Code Workspace (*.code-workspace)': [VSCODE_EXT]
                }
            });
            if (selected) {
                const displayName = selected.displayName;
                if (!displayName.endsWith(`.${THEIA_EXT}`) && !displayName.endsWith(`.${VSCODE_EXT}`)) {
                    selected = selected.parent.resolve(`${displayName}.${THEIA_EXT}`);
                }
                exist = await this.fileSystem.exists(selected.toString());
                if (exist) {
                    overwrite = await this.confirmOverwrite(selected);
                }
            }
        } while (selected && exist && !overwrite);

        if (selected) {
            this.workspaceService.save(selected);
        }
    }

    private async confirmOverwrite(uri: URI): Promise<boolean> {
        const confirmed = await new ConfirmDialog({
            title: 'Overwrite',
            msg: `Do you really want to overwrite "${uri.toString()}"?`
        }).open();
        return !!confirmed;
    }
}
