import * as fs from 'mz/fs'
import Tokenizr, { IToken } from "Tokenizr";
import { Dict } from './tools';
import { stripIndent, inlineLists } from 'common-tags';

const lexer = new Tokenizr();

enum Operation {
    Add,
    Subtract,
    Negate,
    And,
    Or
}

enum OperationKind {
    Constant,
    Unary,
    Binary,
}

const operationLiterals: Dict<Operation> = {
    '+': Operation.Add,
    '-': Operation.Subtract,
    '!': Operation.Negate,
    '&': Operation.And,
    '|': Operation.Or,
}

type TokenTypes = {
    loadMarker: never;
    openDeclaration: never;
    closeDeclaration: never;
    assignment: never;
    jump: never;
    separator: never;

    operation: Operation;
    identifier: string;
    number: number;

    EOF: never;
};

lexer.rule(/@/, ctx => ctx.accept("loadMarker"));
lexer.rule(/\(/, ctx => ctx.accept("openDeclaration"));
lexer.rule(/\)/, ctx => ctx.accept("closeDeclaration"));
lexer.rule(/=/, ctx => ctx.accept("assignment"));
lexer.rule(/;/, ctx => ctx.accept("jump"));
lexer.rule(/[-+&|!]/, (ctx, match) => ctx.accept("operation", operationLiterals[match[0]]))

lexer.rule(/[A-Za-z_][A-Za-z0-9_]*/, ctx => ctx.accept("identifier"));
lexer.rule(/[0-9]+/, (ctx, match) => {
    ctx.accept("number", parseInt(match[0]));
});

// Ignore any comments starting from // until the end of the line.
// Have to not swallow the line break and emit a separator, though
lexer.rule(/\/\/[^\r\n]*\r?\n/, ctx => ctx.accept("separator"));
// Ignore none line-terminating whitespace
lexer.rule(/[ \t]+/, ctx => ctx.ignore());

// Line breaks of non-empty lines we treat as separators
lexer.rule(/\n/, ctx => ctx.accept("separator"));


function tokenize(contents: string) {
    return lexer.input(contents);
}

export enum InstructionTypes {
    A, C
}

export enum Register {
    D = "D", A="A", M="M"
}
const allowedMnemonics = ["M", "D", "MD", "A", "AM", "AD", "AMD"];
export enum DestinationFlags {
    A    = 0x4,
    D    = 0x2,
    M    = 0x1,
    None = 0x0
}

export enum JumpFlags {
    LessThan    = 0x4,
    Equal       = 0x2,
    GreaterThan = 0x1,
    None        = 0x0
}

export type ConstantOperation = {
    kind: OperationKind.Constant;
    operand: Register | 1 | 0;
}
export type UnaryOperation = {
    kind: OperationKind.Unary;
    op: Operation;
    operand: Register | 1 | 0;
};
export type BinaryOperation = {
    kind: OperationKind.Binary;
    op: Operation
    firstOperand: Register | 1 | 0;
    secondOperand: Register | 1 | 0;
}

export type Instruction = {
    kind: InstructionTypes.A;
    rawValue: number;
} | {
    kind: InstructionTypes.C;
    destination: DestinationFlags;
    operation: ConstantOperation | UnaryOperation | BinaryOperation;
    jump: JumpFlags;
};

export interface Program {
    instructions: Instruction[];
    symbolTable: Dict<number>;
    jumpTable: Dict<number>;
}

// Tables and limits

const maxNumberLiteral = 0x7FFF;

const destinationMnemonics: Dict<DestinationFlags> = {
    M   : DestinationFlags.M,
    D   : DestinationFlags.D,
    MD  : DestinationFlags.M | DestinationFlags.D,
    A   : DestinationFlags.A,
    AM  : DestinationFlags.A | DestinationFlags.M,
    AD  : DestinationFlags.A | DestinationFlags.D,
    AMD : DestinationFlags.A | DestinationFlags.D | DestinationFlags. M
}

const jumpMnemonics: Dict<JumpFlags> = {
    JGT: JumpFlags.GreaterThan,
    JEQ: JumpFlags.Equal,
    JGE: JumpFlags.Equal | JumpFlags.GreaterThan,
    JLT: JumpFlags.LessThan,
    JNE: JumpFlags.LessThan | JumpFlags.GreaterThan,
    JLE: JumpFlags.LessThan | JumpFlags.Equal,
    JMP: JumpFlags.LessThan | JumpFlags.Equal | JumpFlags.GreaterThan
};

const reservedSymbols: Dict<number> = {
     R0:  0,  R1:  1,  R2:  2,  R3:  3,
     R4:  4,  R5:  5,  R6:  6,  R7:  7,
     R8:  8,  R9:  9, R10: 10, R11: 11,
    R12: 12, R13: 13, R14: 14, R15: 15,
}

function filePrefix(file: string, line?:number, col?:number) {
    return `${file}${line != null ? ':' + line: ''}${col != null ? ':' + col : ''} —`;
}
function errorPrefix(file: string, line?:number, col?:number) {
    return `${filePrefix(file, line, col)} Error:`;
}
function warningPrefix(file: string, line?:number, col?:number) {
    return `${filePrefix(file, line, col)} Warning:`;
}
class Parser {
    private availableTokens: IToken<unknown>[] = [];
    private readonly lookaheadBufferStack: IToken<unknown>[][] = [];

    private lastCheckedToken: IToken<unknown>|null = null;

    constructor(
        public readonly file: string, 
        private readonly input: Tokenizr,
        public debug: boolean,
    ) {

    }

    private nextTokenSimple() {
        const saved = this.availableTokens.shift();
        if(saved !== undefined) {
            this.lastCheckedToken = saved;
            return saved;
        } 
        this.lastCheckedToken = this.input.token();
        return this.lastCheckedToken;
    }

    private nextToken():IToken<unknown>|null {
        const token = this.nextTokenSimple();
        if(token == null) {
            return null;
        }
        if(this.lookaheadBufferStack.length > 0) {
            this.lookaheadBufferStack[this.lookaheadBufferStack.length - 1].push(token);
        }
        if(this.debug && token != null) {
            console.log(this.printToken(token));
        }
        return token;
    }

    private lookAhead() {
        this.lookaheadBufferStack.push([]);
    }

    private rollback(purge: boolean) {
        const buffer = this.lookaheadBufferStack.pop();
        if(buffer === undefined) {
            throw new Error("Internal error: tried to rollback without starting a look-ahead");
        }
        if(this.debug) {
            console.log(`Roll back on ${purge ? 'success' : 'fail'}`, buffer.map(this.printToken));
        }
        
        if(purge) {
            if(this.lookaheadBufferStack.length > 0) {
                this.lookaheadBufferStack[this.lookaheadBufferStack.length - 1].push(...buffer);
            }
        } else {
            this.availableTokens = buffer.concat(this.availableTokens);
        }
    }

    printToken(token: IToken<unknown>) {
        return `T ${token.type} (${token.value})`;
    }
    currentErrorPrefix() {
        return errorPrefix(this.file, this.currentLine, this.currentCol);
    }

    expect<K extends keyof TokenTypes>(kind: K, 
        allowedValues?:TokenTypes[K]|TokenTypes[K][]|((val: TokenTypes[K]) => boolean),
        errorMessageForValue?: (val: TokenTypes[K]) => string
    ): TokenTypes[K] {
        const curr = this.nextToken();
        if(curr == null) {
            throw new Error(`${errorPrefix(this.file)} '${kind}' expected, but reached end of file`);
        }
        if(curr.type !== kind) {
            throw new Error(stripIndent`
            ${this.currentErrorPrefix()} '${kind}' expected.
                Found '${curr.type}' instead.
            `);
        }
        const val = curr.value as TokenTypes[K];
        if(allowedValues !== undefined) {
            if(allowedValues instanceof Function) {
                if(!allowedValues(val)) {
                    const message = errorMessageForValue != undefined ? errorMessageForValue(val)
                        : `${this.currentErrorPrefix()} Value '${val}' is not allowed.`;
                    throw new Error(message);
                }
            } else {
                const allowedList = allowedValues instanceof Array ? allowedValues : [allowedValues];
                if(!allowedList.some(allowed => val === allowed)) {
                    const message = errorMessageForValue != undefined ? errorMessageForValue(val)
                        : `${this.currentErrorPrefix()} Value '${val}' is not allowed.`;
                    throw new Error(message);
                }
            } 
        }
        return val;
    }
    
    optional(parserFunc: () => void) {
        let success = true;
        this.lookAhead();
        try {
            parserFunc();
        } catch(err) {
            if(err.name === "fatal") {
                throw err;
            }
            success = false;
        }
        this.rollback(success);
        return success;
    }

    match(name: string, ...funcs: (() => void)[]) {
        this.lookAhead();
        if(this.debug) {
            console.log("Trying match: ", name);
        }
        for(let i=0; i<funcs.length; ++i) {
            if(this.optional(funcs[i])) {
                this.rollback(true);
                return i;
            }
        }
        const token = this.nextToken();
        if(token == null) {
            throw new Error(`${this.currentErrorPrefix()} end of file reached while looking for '${name}'`);
        } else {
            throw new Error(`${this.currentErrorPrefix()} Found unexpected token ${token.text} while looking for '${name}'`);
        }
        
    }

    fatal(message: string) {
        const error = new Error(this.currentErrorPrefix() + ' ' + message);
        error.name = "fatal";
    }

    get currentLine() {
        return this.lastCheckedToken != null ? this.lastCheckedToken.line : undefined;
    }
    get currentCol() {
        return this.lastCheckedToken != null ? this.lastCheckedToken.column : undefined;
    }
    
}

function parseBoolean(p: Parser): 0|1 {
    const num = p.expect("number");
    if(num !== 0 && num !== 1) {
        p.fatal(`found ${num} where only a 0 or 1 value is allowed`);
    }
    return num as 0|1;
}
function parseRegister(p: Parser): Register {
    const id = p.expect("identifier");
    if(Register[id as any] == null) {
        p.fatal(`expected a valid register, but found ${id}`);
    }
    return Register[id as any] as Register;
}

function parseRegisterOrBool(p: Parser): Register | 0 | 1 {
    let result: Register | 0 | 1 = 0;
    p.match("register or constant",
        () => result = parseBoolean(p),
        () => result = parseRegister(p)
    )
    return result;
}

export async function parse(file: string): Promise<Program> {
    const contents = await fs.readFile(file, "utf8");

    const tokeniser = tokenize(contents);
    const p = new Parser(file, tokeniser, true);

    const instructionList: Instruction[] = [];
    const symbolTable: Dict<number> = Object.assign({}, reservedSymbols);
    const jumpTable: Dict<number> = {};
    
    let currentUnassignedLabel = -1;
    
    let reachedEnd = false;
    while(!reachedEnd) {
        
        // Ignore any extra line breaks
        while(p.optional(() => p.expect("separator"))) { }
        
        // EOF before we reach the next instruction
        p.optional(() => {
            p.expect("EOF")
            reachedEnd = true;
        });
        if(reachedEnd) {
            break;
        }

        p.match("next instruction",
            // A instruction
            () => {
                p.expect("loadMarker");
                p.match("label or raw number",
                    () => {
                        const num = p.expect('number');
                        const clipped = num & maxNumberLiteral;
                        if(num > maxNumberLiteral) {
                            console.warn(stripIndent`
                                ${warningPrefix(file, p.currentLine, p.currentCol)} value of literal 
                                ${num} exceeds the maximum allowed ${maxNumberLiteral}.
                                Will overflow to ${clipped} in the generated machine code.
                            `);
                        }
                        instructionList.push({
                            kind: InstructionTypes.A,
                            rawValue: clipped
                        });
                    },
                    () => {
                        const label = p.expect("identifier");
                        if(symbolTable[label] == null) {
                            symbolTable[label] = currentUnassignedLabel;
                            currentUnassignedLabel--;
                        }
                        const pointer = symbolTable[label];
                        instructionList.push({
                            kind: InstructionTypes.A,
                            rawValue: pointer
                        });
                    }
                )
            },
            // C instruction
            () => {
                let dest: DestinationFlags = DestinationFlags.None;
                p.optional(() => {
                    const destMnemonic = p.expect("identifier");
                    p.expect("assignment");

                    if(destinationMnemonics[destMnemonic] == null) {
                        p.fatal(`invalid destination mnemonic '${destMnemonic}`);
                    }
                    dest = destinationMnemonics[destMnemonic];
                });

                let operation: ConstantOperation | UnaryOperation | BinaryOperation | null = null;
                p.match("operation",
                    // Unary
                    () => {
                        const op = p.expect("operation", 
                            op => op === Operation.Negate || op === Operation.Subtract,
                            op => `Expected unary operation, but found ${Operation[op]}`
                        );
                        const operand = parseRegisterOrBool(p);
                        operation = {
                            kind: OperationKind.Unary,
                            op,
                            operand
                        }
                    },
                    // Binary
                    () => {
                        const firstOperand = parseRegisterOrBool(p);
                        const op = p.expect("operation", 
                            op => op !== Operation.Negate,
                            op => `Expected binary operation, but found ${Operation[op]}`
                        );
                        const secondOperand = parseRegisterOrBool(p);
                        operation = {
                            kind: OperationKind.Binary,
                            op,
                            firstOperand,
                            secondOperand
                        };
                    },
                    // Constant, have to handle after binary to not shortcurcuit it.
                    () => {
                        const operand = parseRegisterOrBool(p);
                        operation = {
                            kind: OperationKind.Constant,
                            operand
                        }
                    }
                );

                if(operation == null) {
                    p.fatal("internal error: could not select operation");
                    return;
                }

                let jump: JumpFlags = JumpFlags.None;
                p.optional(() => {
                    p.expect("jump");
                    const jumpMnemonic = p.expect("identifier");
                    if(jumpMnemonics[jumpMnemonic] == null) {
                        p.fatal(`invalid jump mnemonic ${jumpMnemonic}`);
                    }
                    jump = jumpMnemonics[jumpMnemonic];
                });

                instructionList.push({
                    kind: InstructionTypes.C,
                    destination: dest,
                    operation,
                    jump
                })
            },
            // Label declaration
            () => {
                p.expect("openDeclaration");
                const label = p.expect("identifier");
                p.expect("closeDeclaration");

                jumpTable[label] = instructionList.length;
            },
        );

        p.match("separator or eof",
            () => {
                p.expect("separator");
            },
            // See if we've reached the end
            () => {
                p.expect("EOF");
                reachedEnd = true;
            }
        )
    }

    return {
        instructions: instructionList,
        symbolTable,
        jumpTable
    };
}