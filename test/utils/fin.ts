import {EventEmitter} from 'events';

import {Identity} from 'hadouken-js-adapter';
import * as deepmerge from 'deepmerge';

import {FakeApplication} from './FakeApplication';
import {FakeWindow} from './FakeWindow';

const emitter = new EventEmitter();
const apps = new Map<string, FakeApplication>();

export function resetFin(): void {
    emitter.removeAllListeners();

    const appList = Array.from(apps.values());
    appList.forEach(app => {
        app.removeAllListeners();

        if (app.identity.uuid !== 'primaryApp') {
            apps.delete(app.identity.uuid);
        }
    });
}

interface SystemAppInfo extends AppState, Identity {
    parentUuid: string;
}

interface AppState {
    isRunning: boolean;
}

class FinSystem {
    public addListener(event, listener): void {
        emitter.addListener(event, listener);
    }

    public removeListener(event, listener): void {
        emitter.removeListener(event, listener);
    }

    public async getAllApplications(): Promise<SystemAppInfo[]> {
        return Array.from(apps.values()).map((app) => {
            return {
                isRunning: app.state.isRunning,
                uuid: app.identity.uuid,
                parentUuid: app.parentUuid
            };
        });
    }

    public async getServiceConfiguration() {
        return {
            name: 'testService',
            config: {
                features: {
                    featureOne: true,
                    featureTwo: false,
                    featureThree: true
                }
            }
        };
    }
}

class FinApplication {
    public me: Identity = {uuid: '', name: ''};

    constructor() {
        this.create({uuid: 'primaryApp', name: 'primaryApp'}, {
            servicesConfiguration: {
                configKey: 'configKeyValue'
            }
        });
    }

    public async create(identity: Identity, manifest: any, parentUuid?: string): Promise<FakeApplication> {
        const sanitizedIdentity = {uuid: identity.uuid, name: identity.name || identity.uuid};

        if (!manifest.startup_app || (manifest.startup_app && (!manifest.startup_app.uuid || !manifest.startup_app.name))) {
            manifest = deepmerge(manifest, {
                // eslint-disable-next-line @typescript-eslint/camelcase
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
    }

    public wrapSync(identity: Identity): FakeApplication {
        const app = apps.get(identity.uuid);

        if (app) {
            return app;
        } else {
            throw new Error(`App ${identity.uuid} / ${identity.name} does not exist.`);
        }
    }

    public getCurrentSync(): FakeApplication {
        return this.wrapSync({uuid: 'primaryApp', name: 'primaryApp'});
    }
}

class FinWindow {
    public wrapSync(identity: Identity): FakeWindow {
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

export const fin = {
    System: new FinSystem(),
    Application: new FinApplication(),
    Window: new FinWindow()
};

global['fin'] = fin;
