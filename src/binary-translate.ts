import { CompiledProgram } from "./compile";

import {SmartBuffer} from 'smart-buffer';
import { InstructionTypes } from "./parser";
import { write } from "fs";

const CInstructionTable = {
    prefix: 0xE000,
    jumpOffset: 0,
    destOffset: 3,
    operationOffset: 6,
}

const oneCode = '1'.charCodeAt(0);
const zeroCode = '0'.charCodeAt(0);
const newlineCode = '\n'.charCodeAt(0);

function writeUint16BinaryString(buf: SmartBuffer, value: number) {
    for(let mask = 1 << 15; mask > 0; mask >>= 1) {
        buf.writeInt8( (mask & value) != 0 ?  oneCode : zeroCode);
    }
}

export function binaryTranslate(program: CompiledProgram) {
    const buf = new SmartBuffer({
        encoding: 'utf-8'
    });

    for(let cmd of program.instructions) {
        if(cmd.kind === InstructionTypes.A) {
            writeUint16BinaryString(buf, cmd.rawValue);
        } else {
            writeUint16BinaryString(buf,
                CInstructionTable.prefix
                | (cmd.operation << CInstructionTable.operationOffset)
                | (cmd.destination << CInstructionTable.destOffset)
                | (cmd.jump << CInstructionTable.jumpOffset)
            );
        }
        buf.writeUInt8(newlineCode);
    }

    return buf;
}