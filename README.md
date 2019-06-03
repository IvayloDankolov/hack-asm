# hack-asm
Assembler implementation for the Hack machine language used in nand2tetris with 
full feature support and intelligible compiler errors.

[Nand2tetris](https://nand2tetris.org) is an online course by Noam Nisan and Shimon Schocken 
for building a computer from the ground up:  
Logic gates → chips → CPU → machine language → assembler  
→ OS → VM → high level programming language.

It's amazing fun and I highly recommend checking it out.

## Features

* Written in TypeScript, runs on Node.
* CLI with commands and options that make a reasonable amount of sense.
* Errors you can actually understand for the most part and that will guide you to the correct position in the code that's wrong.
* 4 step compilation process:
1. Tokeniser
2. Parse and build an intermediate representation
3. Symbol resolution
4. Binary translation.

Possible TODO is separating out parsing and validation, and having an IL model a bit less tightly coupled with the actual binary mechanics of how the instructions are represented. Generally not a big deal.

* A little mini parsing DSL with stackable lookahead I built for fun. It's neat for being basically 30 lines, and I might expand the idea into something more full-fledged later for building the higher leveled Jack compiler.

## Usage
If you want the `hack-asm` command added to your PATH directly, 
you can either `npm install -g` or, alternatively, `npm link` the cloned repo.

The CLI utility will guide you through the available options if you run it with no arguments.

To do basic compilation, just run:
```bash
hack-asm input.asm out.hack 
```
If you omit the destination file, the compiler will automatically infer it using the base name of the input, e.g. `input.hack`
