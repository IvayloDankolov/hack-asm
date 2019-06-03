# hack-asm
Assembler implementation for the Hack machine language used in nand2tetris with 
full feature support and intelligible compiler errors.

[Nand2tetris](https://nand2tetris.org) is an online course by Noam Nisan and Shimon Schocken 
for building a computer from the ground up:  
Logic gates → chips → CPU → machine language → assembler  
→ OS → VM → high level programming language.

It's amazing fun and I highly recommend checking it out.

## Usage
If you want the `hack-asm` command added to your PATH directly, 
you can either `npm install -g` or, alternatively, `npm link` the cloned repo.

The CLI utility will guide you through the available options if you run it with no arguments.

To do basic compilation, just run:
```bash
hack-asm input.asm out.hack 
```
If you omit the destination file, the compiler will automatically infer it using the base name of the input, e.g. `input.hack`
