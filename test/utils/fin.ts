import { EventEmitter } from "events";
import { Identity } from "hadouken-js-adapter";
import * as deepmerge from 'deepmerge';

const emitter = new EventEmitter();
const apps = new Map<String, FakeApplication>();

export const fin = {
    System: {
        addListener: (event, listener) => {
            emitter.addListener(event, listener);
        },
        removeListener: (event, listener) => {
            emitter.removeListener(event, listener);
        },
        getAllApplications: async () => {
            return Array.from(apps.values()).map(app => {
                return {
                    isRunning: app.state.isRunning,
                    uuid: app.identity.uuid,
                    parentUuid: app.parentUuid
                }
            })
        }
    },
    Application: {
        me: {uuid: '', name: ''},
        create: (identity: Identity, manifest: any, parentUuid?: string) => {
            const sanitizedIdentity = {uuid: identity.uuid, name: identity.name || identity.uuid};

            if(!manifest.startup_app || (manifest.startup_app && (!manifest.startup_app.uuid || !manifest.startup_app.name))){
                manifest = deepmerge(manifest, {
                    startup_app: sanitizedIdentity
                });
            }

            if(!apps.has(identity.uuid)) {
                const app = new FakeApplication(sanitizedIdentity, manifest);
                apps.set(identity.uuid, app);

                if(parentUuid) {
                    app.setParentUuid(parentUuid);
                }

                emitter.emit('application-created', identity);

                return app;
            }
        },
        wrapSync: (identity: Identity) => {
            const app = apps.get(identity.uuid);

            if(app){
                return app;
            }

            throw new Error(`App ${identity.uuid} / ${identity.name} does not exist.`)
        }
    },
    Window: {
        wrapSync: (identity: Identity) => {
            const app = apps.get(identity.uuid);

            if(app) {
                const window = app.getWindows().get(identity.name);

                if(window){
                    return window;
                } else {
                    app.createChildWindow(identity.name);
                }
            } else {
                throw new Error(`App ${identity.uuid} / ${identity.name} does not exist`);
            }
        }
    }
};

interface AppState {
    isRunning: boolean;
}

class FakeApplication extends EventEmitter {
    private _identity: Identity;
    private _windows: Map<String, FakeWindow> = new Map<String, FakeWindow>();
    private _parentUuid: string|undefined;
    private _manifest: any;
    private _state: AppState = {isRunning: true};
    
    constructor(identity: Identity, manifest: any) {
        super();
        
        this._identity = identity;
        this._manifest = manifest;
        
        this.createChildWindow(this._identity.name);
    }
    
    public get parentUuid() {
        return this._parentUuid;
    }
    
    public get identity() {
        return this._identity;
    }
    
    public get me() {
        return this._identity;
    }
    
    public get state() {
        return this._state;
    }
    
    private updateState(state: AppState) {
        this._state = Object.assign(this._state, state);
    }
    
    public async getInfo() {
        return {
            manifest: this._manifest,
            parentUuid: this._parentUuid
        }
    }
    
    public createChildWindow(name: string) {
        const window = new FakeWindow({uuid: this._identity.uuid, name});
        this._windows.set(name, window);

        return window;
    }

    public createChildApp(identity: Identity) {
        return fin.Application.create(identity, this._manifest, this._identity.uuid);
    }
    
    public getWindows() {
        return this._windows;
    }
    
    public setParentUuid(parentUuid: string) {
        this._parentUuid = parentUuid;
    }

    public close() {
        this.updateState({isRunning: false});
        this.emit('closed', {type: "closed", topic: "application", uuid: this._identity.uuid});
    }
    
}

class FakeWindow extends EventEmitter {
    private _identity: Identity;
    private _parentUuid: string;

    constructor(identity: Identity) {
        super();

        this._identity = identity;
        this._parentUuid = identity.uuid;
    }

    public get identity() {
        return this._identity;
    }

    public get parentUuid() {
        return this._parentUuid;
    }
}

global['fin'] = fin;