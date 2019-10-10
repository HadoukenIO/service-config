import {Application, Identity} from 'hadouken-js-adapter';
import {ApplicationInfo} from 'hadouken-js-adapter/out/types/src/api/application/application';
import {ApplicationEvent, WindowEvent} from 'hadouken-js-adapter/out/types/src/api/events/base';
import {ApplicationInfo as SystemApplicationInfo} from 'hadouken-js-adapter/out/types/src/api/system/application';
import {ServiceConfiguration} from 'hadouken-js-adapter/out/types/src/api/system/external-process';
import {Fin} from 'hadouken-js-adapter';
import {_Window} from 'hadouken-js-adapter/out/types/src/api/window/window';

import {ApplicationScope, Scope} from './Types';
import {ConfigUtil} from './ConfigUtil';
import {ConfigWithRules, ScopedConfig, Store} from './Store';
import {SourceWatch} from './Watch';
import {DeferredPromise} from './DeferredPromise';

declare const fin:Fin;

/**
 * Contents of an app.json file.
 *
 * Partial declaration - only includes the fields used by Loader.
 */
interface AppManifest<T> {
    uuid: string;
    startup_app: {uuid: string};
    services?: ServiceDeclaration<T>[];
}
interface ServiceDeclaration<T> {
    name: string;
    config?: ConfigWithRules<T>;
    manifestUrl?: string;
}

interface AppState {
    scope: ApplicationScope;
    isRunning: boolean;
    parent: AppState|null;
    children: AppState[];
    isServiceAware: boolean;
}

type ServiceConfig<T> = ServiceConfiguration & {config: T};

/**
 * Configuration loader, responsible for listening for application lifecycle events, and loading/unloading any
 * application-defined config to/from the store.
 */
export class Loader<T> {
    private _store: Store<T>;
    private _serviceName: string;
    private _defaultConfig: T|null;

    private _appState: {[uuid: string]: AppState};
    private _watch: SourceWatch<T>;

    /**
     * Maps an application UUID to the UUID of it's "parent" application.
     *
     * This will typically be fetched from the `getInfo` API, but in the case of restoring programmatically-created
     * apps, we want the loader to behave as if the application was started by the parent UUID stored within the
     * workspace data, rather than as being started by the service.
     */
    private _appParentMap: {[uuid: string]: string};

    /**
     * List of stringified window scopes that have added rules to the store.
     */
    private _windowsWithConfig: string[];

    /**
     * Initialization indication flag to check that we have completely finished any async constructor operations.
     */
    private _initialized: DeferredPromise<void>;

    /**
     * Creates a config loader.
     *
     * The loader needs to know the name of the service, so that it knows where to look within the application
     * manifests. Multiple names can be provided, due to the need to possibly define multiple versions of the service,
     * for example to run the service both in the "default" realm and within one or more security realms.
     *
     * For any applications that are not service-aware, some default configuration can also be specified. Here,
     * "service-aware" is defined as either declaring the service within the application's manifest, or being a
     * programmatically-launched application, that was launched by a "service-aware" application.
     *
     * @param store Store to which application-defined config will be placed
     * @param serviceNames The name of the service, plus aliases if appropriate
     * @param defaultConfig Optionally, config to add to the store for any application that isn't service-aware
     */
    constructor(store: Store<T>, serviceName: string, defaultConfig?: T) {
        this._store = store;
        this._serviceName = serviceName;
        this._defaultConfig = defaultConfig || null;
        this._appState = {};
        this._appParentMap = {};
        this._initialized = new DeferredPromise();

        this._windowsWithConfig = [];
        this._watch = new SourceWatch<T>(this._store, {level: 'window', uuid: {expression: '.*'}, name: {expression: '.*'}});
        this._watch.onAdd.add(this.onConfigAddedFromWindow, this);

        // Pre-bind fin callback functions
        this.onApplicationCreated = this.onApplicationCreated.bind(this);
        this.onApplicationClosed = this.onApplicationClosed.bind(this);
        this.onWindowClosed = this.onWindowClosed.bind(this);

        this.loadDesktopOwnerConfiguration().then(async () => {
            // Listen for any new windows created and register their config with the service
            fin.System.addListener('application-created', this.onApplicationCreated);

            const allApplications: SystemApplicationInfo[] = await fin.System.getAllApplications();

            await Promise.all(allApplications.map(async app => {
                if (app.isRunning) {
                    // Register the main window
                    await this.onApplicationCreated(app);
                }
            }));

            this._initialized.resolve();
        });
    }

    public get initialized(): Promise<void> {
        return this._initialized.promise;
    }

    /**
     * Instructs the Loader to override the parent UUID of an application that is about to start.
     *
     * @param appUuid The UUID of an application that is about to be created
     * @param parentUuid The UUID of the application that should be considered appUuid's parent
     */
    public overrideAppParent(appUuid: string, parentUuid: string): void {
        if (this._appParentMap[appUuid] !== undefined) {
            console.warn('Application already existed within expectedAppState map:', appUuid);
        }

        this._appParentMap[appUuid] = parentUuid;
    }

    /**
     * Allows access to parentUuid data within the loader's app cache.
     *
     * Due to overrides applied via `overrideAppParent`, the data in this cache can occasionally differ from that
     * which is returned from `getInfo`. In these cases, we often wish to use this 'intended' parentUuid, rather
     * than the actual underlying parent UUID.
     *
     * Returns undefined if requested app doesn't exist within the cache, or if the parent/parentUuid of the app is
     * not known.
     *
     * @param appUuid Application to query for cached parent UUID
     */
    public getAppParent(appUuid: string): string|undefined {
        const state = this.getAppState(appUuid);
        return (state && state.parent && state.parent.scope.uuid) || undefined;
    }

    /**
     * Add timeout for `getServiceConfiguration` to prevent it hanging.
     */
    private async getServiceConfigurationOrTimeout(): Promise<ServiceConfiguration> {
        const timer = new Promise<ServiceConfiguration>((resolve, reject) => {
            setTimeout(() => reject(new Error('Timeout trying to retrieve the service config.')), 5000);
        });

        return Promise.race([fin.System.getServiceConfiguration({name: this._serviceName}), timer]);
    }

    private async loadDesktopOwnerConfiguration(): Promise<void> {
        const desktopOwnerConfig: T | null = await this.getServiceConfigurationOrTimeout()
            .then(config => (config as ServiceConfig<T>).config).catch(() => null);

        const serviceConfig: T | null = await fin.Application.getCurrentSync().getManifest()
            .then(manifest => manifest.serviceConfiguration || null).catch(() => null);

        // Prefer service manifest over desktop owner file configs.
        // Service configs are placed under a non-documented key so this should not be used in production.
        if (desktopOwnerConfig && serviceConfig) {
            console.warn('Found service config in Desktop Owner File and Service Manifest. Using Service Manifest config');
            this._store.add({level: 'desktop'}, serviceConfig);
        } else if (serviceConfig) {
            this._store.add({level: 'desktop'}, serviceConfig);
        } else if (desktopOwnerConfig) {
            this._store.add({level: 'desktop'}, desktopOwnerConfig);
        }
    }

    private async onApplicationCreated(identity: Identity): Promise<void> {
        const app: Application = fin.Application.wrapSync(identity);

        if (identity.uuid === fin.Application.me.uuid) {
            // Do not parse the manifest of the service itself
            return;
        }

        const info: ApplicationInfo = await app.getInfo();

        const manifest: AppManifest<T> = info.manifest as AppManifest<T>;
        const isManifest: boolean = !!manifest && manifest.startup_app.uuid === identity.uuid;
        let parentUuid: string|undefined = info.parentUuid;
        let appConfig: ConfigWithRules<T>|null = null;
        let isServiceAware = false;

        // Override parent UUID if it's an app we have been expecting to start-up
        const overrideParentUuid: string|undefined = this._appParentMap[identity.uuid];
        if (overrideParentUuid) {
            console.log(`Tracking ${identity.uuid} as having parent ${overrideParentUuid} over ${parentUuid}`);

            parentUuid = overrideParentUuid;
            delete this._appParentMap[identity.uuid];
        }

        if (isManifest && manifest.services && manifest.services.length) {
            // Check for service declaration within app manifest
            manifest.services.forEach((service: ServiceDeclaration<T>) => {
                if (this._serviceName === service.name) {
                    // App explicitly requests service, avoid adding any default config
                    isServiceAware = true;

                    if (service.config) {
                        console.log(`Using config from ${identity.uuid}/${service.name}`);

                        // Load the config from the application's manifest
                        appConfig = service.config;
                    } else {
                        console.log(`App ${identity.uuid}/${service.name} declares service, but doesn't contain config`);
                    }
                }
            });
        } else if (!isManifest && parentUuid && this._appState.hasOwnProperty(parentUuid)) {
            // Don't use the default config if this is a programmatic child of a service-aware app
            const parentState: AppState = this.getAppState(parentUuid)!;
            isServiceAware = parentState.isServiceAware;
        }

        // Build app metadata hierarchy
        if (parentUuid && (this._appState.hasOwnProperty(parentUuid) || !isManifest)) {
            // Fetch parent state
            let parentState: AppState|null = this.getAppState(parentUuid);
            if (!parentState) {
                // Parent must have been a manifest-app that declared the service, but no custom config
                console.log(`Late-registering ${parentUuid} as service-aware (manifest-launched) app`);
                parentState = this.getOrCreateAppState(fin.Application.wrapSync({uuid: parentUuid}), true);
            }

            // App *may* be service-aware on it's own, but if it's state hasn't already been created by this point, then inherit awareness from parent app
            const state = this.getOrCreateAppState(app, parentState.isServiceAware);

            console.log(`Registering ${identity.uuid} as a child of ${parentState.scope.uuid}`);
            state.parent = parentState;
            parentState.children.push(state);
        }

        // Use default config for any apps that don't reference the service in any way
        if (!isServiceAware && this._defaultConfig) {
            const parentState: AppState|null = this.getAppState(parentUuid || '');

            if (!parentState || !parentState.isServiceAware) {
                console.log(`Using default config for ${identity.uuid}`);

                // Application doesn't reference this service, use whatever fall-back configuration was specified for this scenario
                appConfig = this._defaultConfig;
            } else {
                console.log(`Not applying default state to ${identity.uuid}, due to service-aware parent app`);
            }
        }

        // If there's config for this app (whether app-defined or default), add it to the store
        if (appConfig) {
            const state = this.getOrCreateAppState(app, isServiceAware);
            this._store.add(state.scope, appConfig);
        }
    }

    private onApplicationClosed(event: ApplicationEvent<'application', 'closed'>): void {
        const scope: Scope = {level: 'application', uuid: event.uuid};
        const state: AppState = this._appState[scope.uuid];

        // Remove listener
        const app = fin.Application.wrapSync({uuid: event.uuid});
        app.removeListener('closed', this.onApplicationClosed);

        if (state) {
            // Mark application as no longer running
            state.isRunning = false;

            // Unload this application's config, unless it may be required by another application
            this.cleanUpApplicationConfig(state);
            let parent = state;
            while (parent.parent && !parent.parent.isRunning) {
                parent = parent.parent;
                console.log('Checking parent', parent.scope.uuid);
                this.cleanUpApplicationConfig(parent);
            }
        }
    }

    /**
     * Cleans-up any config within the store for applications that are no longer running and have no child applications
     * that may be dependent on rules defined in a parent application.
     *
     * @param app An application within the hierarchy. May still be running, or could have closed already.
     */
    private cleanUpApplicationConfig(app: AppState): void {
        app.children.forEach((child: AppState) => this.cleanUpApplicationConfig(child));

        if (!app.isRunning && app.children.length === 0) {
            console.log(`Discarding config from ${app.scope.uuid}`);

            // Unload config
            this._store.removeFromSource(app.scope);

            // Clean-up AppState
            const index = app.parent ? app.parent.children.indexOf(app) : -1;
            if (index >= 0) {
                app.parent!.children.splice(index, 1);
            }
            delete this._appState[app.scope.uuid];
        }
    }

    private onWindowClosed(event: WindowEvent<'window', 'closed'>): void {
        const scope: Scope = {level: 'window', uuid: event.uuid, name: event.name};

        // Remove config
        console.log(`Unloading config from Window '${scope.uuid}/${scope.name}'`);
        this._store.removeFromSource(scope);

        // Remove from list of windows with listeners
        const sourceId: string = ConfigUtil.getId(scope);
        const index: number = this._windowsWithConfig.indexOf(sourceId);
        if (index >= 0) {
            this._windowsWithConfig.splice(index, 1);
        }
    }

    private onConfigAddedFromWindow(rule: ScopedConfig<T>, source: Scope): void {
        const sourceId: string = ConfigUtil.getId(source);

        if (source.level === 'window' && !this._windowsWithConfig.includes(sourceId)) {
            this._windowsWithConfig.push(sourceId);

            fin.Window.wrapSync(source).once('closed', this.onWindowClosed);
        }
    }

    private getAppState(app: string|Identity): AppState|null {
        const uuid: string = (app as Identity).uuid || (app as string);
        return this._appState[uuid] || null;
    }

    private getOrCreateAppState(app: Application, isServiceAware: boolean): AppState {
        const uuid = app.identity.uuid;
        let state: AppState = this._appState[uuid];

        if (!state) {
            state = {scope: {level: 'application', uuid}, isRunning: true, parent: null, children: [], isServiceAware};

            app.addListener('closed', this.onApplicationClosed);

            this._appState[uuid] = state;
        }

        return state;
    }
}
