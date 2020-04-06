import * as assert from 'assert';

import {Identity} from 'hadouken-js-adapter';

import {Loader} from '../src/Loader';
import {Store, ConfigWithRules} from '../src/Store';
import {RequiredRecursive} from '../src/ConfigUtil';

import {delay, Duration} from './utils/delay';
import {fin, resetFin} from './utils/fin';
import {FakeApplication} from './utils/FakeApplication';
import {FakeWindow} from './utils/FakeWindow';

let store: Store<ConfigTemplate>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let loader: Loader<ConfigTemplate>;
let counter: number = 0;

/**
 * Configuration object used for testing.
 *
 * In real usage, this would come from a JSON schema.
 */
interface ConfigTemplate {
    enabled?: boolean;
    features?: {
        featureOne?: boolean;
        featureTwo?: boolean;
        featureThree?: boolean;
    };
    theme?: {
        color?: string;
        border?: number;
    };
}

type Config = RequiredRecursive<ConfigTemplate>;
type ServiceType = 'desktop-service' | 'runtime-injected';

const defaults: Config = {
    enabled: true,
    features: {
        featureOne: true,
        featureTwo: false,
        featureThree: true
    },
    theme: {
        color: 'red',
        border: 5
    }
};

function createUuid(): string {
    return `test-app-config-${++counter}`;
}

function getWindowConfig(storeConfig: Store<ConfigTemplate>, identity: Identity): Config {
    return storeConfig.query({level: 'window', uuid: identity.uuid, name: identity.name || identity.uuid});
}

function createChildApp(uuid: string, parentUuid: string): Promise<FakeApplication> {
    const parentApp: FakeApplication = fin.Application.wrapSync({uuid: parentUuid});
    return parentApp.createChildApp({uuid});
}

function createAppWithConfig(uuid: string, config: Partial<ConfigWithRules<ConfigTemplate>>, serviceType: ServiceType): Promise<FakeApplication> {
    let manifest;

    if (serviceType === 'desktop-service') {
        manifest = {services: [{name: 'testService', config}]};
    } else {
        // eslint-disable-next-line @typescript-eslint/camelcase
        manifest = {startup_app: {testServiceApi: true, testServiceConfig: config}};
    }

    return fin.Application.create({uuid}, manifest);
}

beforeEach(() => {
    // Suppress console output within tests
    jest.spyOn(console, 'log').mockImplementation();

    // Clear existing listeners/apps
    resetFin();

    store = new Store<ConfigTemplate>(defaults);
    loader = new Loader<ConfigTemplate>(store, 'testService');
});

describe.each<ServiceType>(['desktop-service', 'runtime-injected'])('When application uses the service via "%s" method', (type) => {
    it('Config is loaded from an application\'s manifest', async () => {
        const app: FakeApplication = await createAppWithConfig(createUuid(), {enabled: false}, type);

        await delay(Duration.STORE_LOADING);

        // Config specifies that window shouldn't be registered
        const config: Config = getWindowConfig(store, app.identity);

        assert.strictEqual(config.enabled, false);
    });

    it('Config is loaded from desktop owner file', async () => {
        expect(store.query({level: 'desktop'}).features).toEqual({featureOne: true, featureTwo: false, featureThree: true});
    });

    it('Config is unloaded when the application exits', async () => {
        const app: FakeApplication = await createAppWithConfig(createUuid(), {enabled: false}, type);

        await delay(Duration.STORE_LOADING);

        // Sanity check - make sure config was definitely loaded initially
        const preConfig: Config = getWindowConfig(store, app.identity);
        assert.strictEqual(preConfig.enabled, false);

        await app.close();

        // App-specific config has been removed, querying 'enabled' returns the default value of true
        const postConfig: Config = getWindowConfig(store, app.identity);
        assert.strictEqual(postConfig.enabled, true);
    });

    it('If an application creates a child application, the config of the parent application persists for the lifecycle of its child', async () => {
        const app: FakeApplication = await createAppWithConfig(createUuid(), {enabled: false}, type);
        const child: FakeApplication = await createChildApp(createUuid(), app.identity.uuid);

        await delay(Duration.STORE_LOADING);

        // Config should disable main app, child app remains registered
        assert.strictEqual((getWindowConfig(store, app.identity)).enabled, false);
        assert.strictEqual((getWindowConfig(store, child.identity)).enabled, true);

        await app.close();

        // No change in config state, as child app extends the lifespan of main app's config
        assert.strictEqual((getWindowConfig(store, app.identity)).enabled, false);
        assert.strictEqual((getWindowConfig(store, child.identity)).enabled, true);

        await child.close();

        // Config should now revert to initial state (everything enabled)
        assert.strictEqual((getWindowConfig(store, app.identity)).enabled, true);
        assert.strictEqual((getWindowConfig(store, child.identity)).enabled, true);
    });

    it('If an application creates a child application, the parent can apply rules to the child that still apply after the parent exits', async () => {
        const childAppUuid: string = createUuid();
        const app: FakeApplication = await createAppWithConfig(createUuid(), {
            enabled: false,
            rules: [{scope: {level: 'application', uuid: childAppUuid}, config: {features: {featureOne: false}}}]
        }, type);
        const childApp: FakeApplication = await createChildApp(childAppUuid, app.identity.uuid);
        const childWindow: FakeWindow = childApp.createChildWindow('child-window-1');

        await delay(Duration.STORE_LOADING);

        await app.close();
        await delay(Duration.STORE_LOADING);

        assert.strictEqual(getWindowConfig(store, childApp.identity).features.featureOne, false);
        assert.strictEqual(getWindowConfig(store, childWindow.identity).features.featureOne, false);
    });
});

it.each<[ServiceType, ServiceType]>([
    ['desktop-service', 'desktop-service'],
    ['desktop-service', 'runtime-injected'],
    ['runtime-injected', 'runtime-injected'],
    ['runtime-injected', 'desktop-service']
])('For independent applications of type "%s" and "%s", there is no shared lifecycle', async (type1, type2) => {
    const app1: FakeApplication = await createAppWithConfig(createUuid(), {enabled: false}, type1);
    const app2: FakeApplication = await createAppWithConfig(createUuid(), {enabled: false}, type2);

    await delay(Duration.STORE_LOADING);

    assert.strictEqual((getWindowConfig(store, app1.identity)).enabled, false);
    assert.strictEqual((getWindowConfig(store, app2.identity)).enabled, false);

    await app1.close();
    await delay(Duration.STORE_LOADING);

    assert.strictEqual((getWindowConfig(store, app1.identity)).enabled, true);
    assert.strictEqual((getWindowConfig(store, app2.identity)).enabled, false);

    await app2.close();
    await delay(Duration.STORE_LOADING);

    assert.strictEqual((getWindowConfig(store, app1.identity)).enabled, true);
    assert.strictEqual((getWindowConfig(store, app2.identity)).enabled, true);
});
