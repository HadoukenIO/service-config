import * as path from 'path';
import {compileFromFile} from 'json-schema-to-typescript';

import {BasePlugin, PluginOptions} from 'openfin-service-tooling/plugins/BasePlugin';

type SchemaToTypeScriptOptions = {
    schemaRoot: string;
}
/**
 * Webpack plugin to generate TypeScript code from one or more JSON schema files.
 */
export class SchemaToTypeScriptPlugin extends BasePlugin<PluginOptions<SchemaToTypeScriptOptions>> {
    constructor(options: PluginOptions<SchemaToTypeScriptOptions>) {
        super('SchemaToTypeScriptPlugin', ".d.ts", options);

        // Load plugin-specific options
        this.parseOptions<SchemaToTypeScriptOptions>(options, {
            schemaRoot: 'string'
        });
    }

    async run() {
        await Promise.all((this.options.input as string[]).map(async (schemaFilename: string) => {
            console.log(`Generating TypeScript definitions for ${path.basename(schemaFilename)}`);
            
            const output = await compileFromFile(schemaFilename, {cwd: this.options.schemaRoot});
            const outputPath = this.getOutputPath(schemaFilename);
            await this.writeFile(outputPath, output);
        }));
    }
}