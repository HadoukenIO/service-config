import {EventEmitter} from 'events';

import {Identity} from 'hadouken-js-adapter';
import * as deepmerge from 'deepmerge';

const emitter = new EventEmitter();
const apps = new Map<String, FakeApplication>();

interface SystemAppInfo extends AppState, Identity {
    parentUuid: string;
}

export const fin = {
    System: {
        addListener: (event, listener): void => {
            emitter.addListener(event, listener);
        },
        removeListener: (event, listener): void => {
            emitter.removeListener(event, listener);
        },
        getAllApplications: async (): Promise<SystemAppInfo[]> => {
            return Array.from(apps.values()).map(app => {
                return {
                    isRunning: app.state.isRunning,
                    uuid: app.identity.uuid,
                    parentUuid: app.parentUuid
                };
            });
        }
    },
    Application: {
        me: {uuid: '', name: ''},
        create: async (identity: Identity, manifest: any, parentUuid?: string): Promise<FakeApplication> => {
            const sanitizedIdentity = {uuid: identity.uuid, name: identity.name || identity.uuid};

            if (!manifest.startup_app || (manifest.startup_app && (!manifest.startup_app.uuid || !manifest.startup_app.name))) {
                manifest = deepmerge(manifest, {
                    startup_app: sanitizedIdentity
                });
            }

            if (!apps.has(identity.uuid)) {
                const app = new FakeApplication(sanitizedIdentity, manifest);
                apps.set(identity.uuid, app);

                if (parentUuid) {
                    app.setParentUuid(parentUuid);
                }

                emitter.emit('application-created', identity);

                return app;
            } else {
                throw new Error(`Application with specified UUID already exists: ${identity.uuid}`);
            }
        },
        wrapSync: (identity: Identity): FakeApplication => {
            const app = apps.get(identity.uuid);

            if (app) {
                return app;
            } else {
                throw new Error(`App ${identity.uuid} / ${identity.name} does not exist.`);
            }
        }
    },
    Window: {
        wrapSync: (identity: Identity): FakeWindow => {
            const app = apps.get(identity.uuid);

            if (app) {
                const window = app.getWindows().get(identity.name);

                if (window) {
                    return window;
                } else {
                    return app.createChildWindow(identity.name);
                }
            } else {
                throw new Error(`App ${identity.uuid} / ${identity.name} does not exist`);
            }
        }
    }
};

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
}

export class FakeWindow extends EventEmitter {
    private readonly _identity: Identity;
    private readonly _parentUuid: string;

    constructor(identity: Identity) {
        super();

        this._identity = identity;
        this._parentUuid = identity.uuid;
    }

    public get identity(): Identity {
        return this._identity;
    }

    public get parentUuid(): string {
        return this._parentUuid;
    }
}

global['fin'] = fin;
