import {EventEmitter} from 'events';

import {Identity} from 'openfin/_v2/main';

import {fin} from './fin';
import {FakeWindow} from './FakeWindow';

interface AppInfo {
    manifest: any;
    parentUuid: string;
}

interface AppState {
    isRunning: boolean;
}

export class FakeApplication extends EventEmitter {
    private readonly _identity: Identity;
    private readonly _manifest: any;
    private _windows: Map<string, FakeWindow> = new Map<string, FakeWindow>();
    private _parentUuid: string|undefined;
    private _state: AppState = {isRunning: true};

    constructor(identity: Identity, manifest: any) {
        super();

        this._identity = identity;
        this._manifest = manifest;

        this.createChildWindow(this._identity.name);
    }

    public get parentUuid(): string {
        return this._parentUuid;
    }

    public get identity(): Identity {
        return this._identity;
    }

    public get me(): Identity {
        return this._identity;
    }

    public get state(): AppState {
        return this._state;
    }

    private updateState(state: AppState) {
        this._state = Object.assign(this._state, state);
    }

    public async getInfo(): Promise<AppInfo> {
        return {
            manifest: this._manifest,
            parentUuid: this._parentUuid
        };
    }

    public createChildWindow(name: string): FakeWindow {
        const window = new FakeWindow({uuid: this._identity.uuid, name});
        this._windows.set(name, window);

        return window;
    }

    public async createChildApp(identity: Identity): Promise<FakeApplication> {
        return fin.Application.create(identity, this._manifest, this._identity.uuid);
    }

    public getWindows(): Map<string, FakeWindow> {
        return this._windows;
    }

    public setParentUuid(parentUuid: string): void {
        this._parentUuid = parentUuid;
    }

    public async close(): Promise<void> {
        this.updateState({isRunning: false});
        this.emit('closed', {type: 'closed', topic: 'application', uuid: this._identity.uuid});
    }

    public async getManifest(): Promise<any> {
        return this._manifest;
    }
}
