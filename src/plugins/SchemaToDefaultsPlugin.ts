import * as path from 'path';
import * as fs from 'fs';

import {BasePlugin} from 'openfin-service-tooling/webpack/plugins/BasePlugin';

/**
 * Ancient module with no types!
 */
const defaults = require('json-schema-defaults');

/**
 * Webpack plugin to generate a static JSON file that contains the default value of every input schema.
 *
 * Any top-level 'rules' object will be stripped-out of the generated JSON, as the 'rules' property has
 * special significance and isn't a part of the actual service-specific set of config options.
 */
export class SchemaToDefaultsPlugin extends BasePlugin<{}> {
    constructor(options: any) {
        super('SchemaToDefaultsPlugin', '.json', options);
    }

    /**
     * Runs the plugin.
     * @param action Specifies which action should occur. If no action is provided then the default action (generate) will be processed.
     */
    public async run(action?: string): Promise<void> {
        if (!action || action.toUpperCase() === 'GENERATE') {
            await Promise.all((this.options.input as string[]).map(async (schemaFilename: string) => {
                console.log(`Generating defaults for ${path.basename(schemaFilename)}`);

                const output = this.getDefaults(schemaFilename);
                const outputPath = this.getOutputPath(schemaFilename);
                await this.writeFile(outputPath, JSON.stringify(output, null, 4));
            }));
        }
    }

    private getDefaults(schemaFilename: string): Promise<object> {
        let schema;
        let result;

        // Load & parse JSON schema
        try {
            schema = JSON.parse(fs.readFileSync(schemaFilename, 'utf8'));
        } catch (e) {
            throw new Error(`Error parsing input schema: ${e.message}\n${e.stack}`);
        }

        // Extract default values for each parameter from the schema
        try {
            // Generate defaults JSON
            result = defaults(schema);

            // Exclude 'rules' array if empty (as it should be)
            if (result.rules && !result.rules.length) {
                delete result.rules;
            }
        } catch (e) {
            throw new Error(`Error generating schema defaults: ${e.message}\n${e.stack}`);
        }

        return result;
    }
}
