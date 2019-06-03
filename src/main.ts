#!/usr/bin/env node

import * as yargs from 'yargs';
import { parse } from './parser';
import { compile } from './compile';
import { binaryTranslate } from './binary-translate';
import * as path from 'path';
import * as fs from 'mz/fs';

yargs
.scriptName("hack-asm")
.usage("$0 <source>")
.command({
    command: "compile <source> [dest]", 
    aliases: ["compile", '*'],
    describe: "comiple a Hack assembly file", 
    builder: yargs => yargs.positional('source', {
        describe: 'Name of the source file written in Hack assembly',
        type: 'string',
    })
    .positional('dest', {
        describe: "Where to save the resulting binary code. Will default to $sourceBasename.hack"
    }),
    handler: async (argv) => {
        const source = argv.source as string;
        let dest: string | undefined = argv.dest as string;
        if(dest == undefined) {
            const p = path.parse(source);
            dest = path.join(p.dir, p.name + '.hack');
        }
        try {
            const program = await compile(source);
            
            const buf = binaryTranslate(program);

            await fs.writeFile(dest, buf.toBuffer());
        } catch(e) {
            console.log(e);
            process.exit(1);
        }
    }
})
.help()
.argv;