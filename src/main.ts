#!/usr/bin/env node

import * as yargs from 'yargs';
import { parse } from './parser';
import { compile } from './compile';

yargs
.scriptName("hack-asm")
.usage("$0 <source>")
.command({
    command: "compile <source>", 
    aliases: ["compile", '*'],
    describe: "comiple a Hack assembly file", 
    builder: yargs => yargs.positional('source', {
        describe: 'Name of the source file written in Hack assembly',
        type: 'string',
    }),
    handler: async (argv) => {
        const source = argv.source as string;
        try {
            const program = await compile(source);
            console.log(program);
        } catch(e) {
            console.log(e);
            process.exit(1);
        }
    }
})
.help()
.argv;