import { parse, Instruction, InstructionTypes } from "./parser";
import { firstUnreservedAddress } from "./hackConfig";

export interface CompiledProgram {
    instructions: Instruction[];
} 

export async function compile(file: string): Promise<CompiledProgram> {
    const {instructions, symbolTable, jumpTable} = await parse(file);

    const reverseLookup: Map<number, number> = new Map();
    let nextUnassignedMemory = firstUnreservedAddress;

    for(let label in symbolTable) {
        const pointer = symbolTable[label];

        if(pointer >= 0) { // Reserved
            continue;
        }
        
        const jump: number | undefined = jumpTable[label];
        if(jump === undefined) {
            reverseLookup.set(pointer, nextUnassignedMemory);
            ++nextUnassignedMemory;
        } else {
            reverseLookup.set(pointer, jump);
        }
    }

    for(let cmd of instructions) {
        if(cmd.kind === InstructionTypes.A && cmd.rawValue < 0) {
            const dest = reverseLookup.get(cmd.rawValue);
            if(dest === undefined) {
                throw new Error(`Internal error: symbol table broken, can't find entry ${cmd.rawValue}`);
            }
            cmd.rawValue = dest;
        }
    }
    

    return {
        instructions: instructions
    };
}