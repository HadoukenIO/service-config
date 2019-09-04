import {EventEmitter} from 'events';

import {Identity} from 'openfin/_v2/main';

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
