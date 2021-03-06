import * as fs from 'mz/fs'
import Tokenizr, { IToken } from "Tokenizr";
import { Dict } from './tools';
import { oneLine } from 'common-tags';
import { reservedSymbols, maxNumberLiteral } from './hackConfig';

const lexer = new Tokenizr();

enum Operation {
    Add,
    Subtract,
    Not,
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
    '!': Operation.Not,
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

lexer.rule(/[A-Za-z_.$:][A-Za-z0-9_.$:]*/, ctx => ctx.accept("identifier"));
lexer.rule(/[0-9]+/, (ctx, match) => {
    ctx.accept("number", parseInt(match[0]));
});

// Ignore any comments starting from // until the end of the line.
// Have to not swallow the line break and emit a separator, though
lexer.rule(/\/\/[^\r\n]*\r?\n/, ctx => ctx.accept("separator"));
// Ignore none line-terminating whitespace
lexer.rule(/[ \t]+/, ctx => ctx.ignore());

// Line breaks of non-empty lines we treat as separators
lexer.rule(/\r?\n/, ctx => ctx.accept("separator"));


function tokenize(contents: string) {
    return lexer.input(contents);
}

export enum InstructionTypes {
    A, C
}

export enum Register {
    D = "D", A="A", M="M"
}
export enum DestinationFlags {
    A    = 0x4,
    D    = 0x2,
    M    = 0x1,
    None = 0x0
}

export enum OperationFlags {
     a = 1 << 6,
    zx = 1 << 5,
    nx = 1 << 4,
    zy = 1 << 3,
    ny = 1 << 2,
     f = 1 << 1,
    no = 1 << 0,
    
    None = 0,
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

function flagIf<T extends number>(flag:T, include: boolean):T {
    return (flag * (include as unknown as number)) as T;
}

function loadOnly(register: Register) {
    return flagIf(OperationFlags.zy | OperationFlags.ny, register === Register.D) 
    | flagIf(OperationFlags.zx | OperationFlags.nx, register !== Register.D) 
    | flagIf(OperationFlags.a, register === Register.M);
}

function flagsForOperation(p: Parser, desc: ConstantOperation|UnaryOperation|BinaryOperation): OperationFlags {
    switch(desc.kind) {
        case OperationKind.Constant:
            switch(desc.operand) {
                case 0:
                    return OperationFlags.zx | OperationFlags.zy | OperationFlags.f;
                case 1: 
                    return OperationFlags.zx | OperationFlags.nx 
                         | OperationFlags.zy | OperationFlags.ny
                         | OperationFlags.f  | OperationFlags.no;
                default:
                    return loadOnly(desc.operand);
            }
        case OperationKind.Unary: {
            switch(desc.op) {
                case Operation.Subtract:
                    switch(desc.operand) {
                        case 0:
                            p.fatal("invalid operation -0.");
                            return OperationFlags.None;
                        case 1:
                            return OperationFlags.zx | OperationFlags.nx | OperationFlags.zy | OperationFlags.f;
                        default:
                            return loadOnly(desc.operand) | OperationFlags.f | OperationFlags.no;
                    }
                case Operation.Not: {
                    if(desc.operand === 0 || desc.operand === 1) {
                        p.fatal("invalid operation, negate on constant is not supported");
                        return OperationFlags.None;
                    }
                    return loadOnly(desc.operand) | OperationFlags.no;
                }
                default:
                    p.fatal("internal error, non-unary operation somehow got recognised as unary.");
                    return OperationFlags.None;
            }
        }
        case OperationKind.Binary:
            const {firstOperand, secondOperand, op} = desc;

            if(firstOperand === 0 || firstOperand === 1) {
                p.fatal("constants are not allowed as first operand in binary operations");
                return OperationFlags.None;
            }
            if(secondOperand === 0 || secondOperand === 1) {
                switch(op) {
                    case Operation.Add:
                        return loadOnly(firstOperand) 
                        | OperationFlags.nx | OperationFlags.ny | OperationFlags.f | OperationFlags.no;
                    case Operation.Subtract:
                        return loadOnly(firstOperand) | OperationFlags.f;
                    default:
                        p.fatal("only + and - take a constant operand.");
                        return OperationFlags.None;
                }
            }
            if(firstOperand === Register.D && secondOperand === Register.D) {
                p.fatal("Can only have the D register on one side of the operation.");
                return OperationFlags.None;
            }
            if((firstOperand === Register.A && secondOperand === Register.M)
            || (firstOperand === Register.M && secondOperand === Register.A)
            ) {
                p.fatal("Can only have a register from the A/M group on one side of the operation.");
                return OperationFlags.None;
            }
            switch(op) {
                case Operation.Add:
                    return flagIf(OperationFlags.a, secondOperand === Register.M || firstOperand === Register.M)
                    | OperationFlags.f;

                case Operation.Subtract:
                    return flagIf(OperationFlags.a, secondOperand === Register.M || firstOperand === Register.M)
                    | flagIf(OperationFlags.nx, firstOperand === Register.D)
                    | flagIf(OperationFlags.ny, secondOperand === Register.D)
                    | OperationFlags.f | OperationFlags.no;

                case Operation.And:
                    // That's actually the default operation with nothing set, we just have to check for memory load.
                    return flagIf(OperationFlags.a, secondOperand === Register.M || firstOperand === Register.M)

                case Operation.Or:
                    return flagIf(OperationFlags.a, secondOperand === Register.M || firstOperand === Register.M)
                    | OperationFlags.nx | OperationFlags.ny | OperationFlags.no;
                    
                case Operation.Not:
                    p.fatal("negation is not a binary operation.");
                    return OperationFlags.None;
            }
            
    }
    p.fatal("internal error: didn't handle an operation case");
    return OperationFlags.None;
}

export type Instruction = {
    kind: InstructionTypes.A;
    rawValue: number;
} | {
    kind: InstructionTypes.C;
    destination: DestinationFlags;
    operation: OperationFlags;
    jump: JumpFlags;
};

export interface Program {
    instructions: Instruction[];
    symbolTable: Dict<number>;
    jumpTable: Dict<number>;
}

// Mnemonic tables

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
        public debug: boolean=false,
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
            throw new Error(oneLine`
            ${this.currentErrorPrefix()} '${kind}' expected.
                Found '${curr.type}' instead.
            `);
        }
        const val = curr.value as TokenTypes[K];
        if(allowedValues !== undefined) {
            if(allowedValues instanceof Function) {
                if(!allowedValues(val)) {
                    const message = errorMessageForValue != undefined ? 
                        errorMessageForValue(val)
                        : `value '${val}' is not allowed.`;
                    this.fatal(message);
                }
            } else {
                const allowedList = allowedValues instanceof Array ? allowedValues : [allowedValues];
                if(!allowedList.some(allowed => val === allowed)) {
                    const message = errorMessageForValue != undefined ? 
                        errorMessageForValue(val)
                        : `value '${val}' is not allowed.`;
                    this.fatal(message);
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
        throw error;
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
    const p = new Parser(file, tokeniser);

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
                            console.warn(oneLine`
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
                            [Operation.Not, Operation.Subtract],
                            op => `expected unary operation, but found ${Operation[op]}`
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
                            op => op !== Operation.Not,
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
                
                const operationFlags = flagsForOperation(p, operation);

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
                    operation: operationFlags,
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