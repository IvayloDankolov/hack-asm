#!/usr/bin/env node

import * as yargs from 'yargs';
import { parse } from './parser';
import { compile } from './compile';
import { binaryTranslate } from './binary-translate';
import * as path from 'path';
import * as fs from 'mz/fs';
import moment from 'moment';
import Table from 'cli-table';
import { getTiming } from './tools';

yargs
.scriptName("hack-asm")
.usage("$0 <source>")
.command({
    command: "compile <source> [dest]", 
    aliases: ["compile", '*'],
    describe: "comiple a Hack assembly file", 
    builder: yargs => yargs
    .positional('source', {
        describe: 'Name of the source file written in Hack assembly',
        type: 'string',
    })
    .positional('dest', {
        describe: "Where to save the resulting binary code. Will default to $sourceBasename.hack"
    })
    .option("verbose", {
        alias: 'v',
        describe: "Show timings and other useful information",
        required: false,
        type: 'boolean',
        default: false,
    }),
    handler: async (argv) => {
        const source = argv.source as string;
        let dest: string | undefined = argv.dest as string;
        if(dest == undefined) {
            const p = path.parse(source);
            dest = path.join(p.dir, p.name + '.hack');
        }

        const verbose = argv.verbose as boolean;
        try {
            const startTime = moment();
            let refTime = moment();
            const timings = new Table({
                chars: {},
                head: ["time", "operation"]
            });
            
            const program = await compile(source);

            const compileSpeed = getTiming(refTime, moment());
            timings.push([compileSpeed, "parsed and compiled"])
            refTime = moment();

            const buf = binaryTranslate(program);

            const translationSpeed = getTiming(refTime, moment());
            timings.push([translationSpeed, "binary translation"]);
            refTime = moment();

            await fs.writeFile(dest, buf.toBuffer());

            const writeSpeed = getTiming(refTime, moment());
            timings.push([writeSpeed, "write destination"])

            const total = getTiming(startTime, moment());
            timings.push([total, "total time"]);

            if(verbose) {
                console.log(timings.toString());
            }
        } catch(e) {
            console.log(e.message);
            process.exit(1);
        }
    }
})
.help()
.argv;