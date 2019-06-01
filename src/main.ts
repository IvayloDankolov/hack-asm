#!/usr/bin/env node

import * as yargs from 'yargs';

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
    handler: (argv) => {
        const source = argv.source;
        console.log(source);
    }
})
.help()
.argv;