// Using my own O(1) mult solution, because I'm an extremely humble person.

// Multiplies R0 and R1 and stores the result in R2.
// (R0, R1, R2 refer to RAM[0], RAM[1], and RAM[2], respectively.)


// While the idea is to not be overly fancy (ater all, multiplication is repeated addition and a simple loop would solve the task in this case),
// I rather fancy one very elegant trick that often appears in dealing with large numbers.
// Using the distributivity of multiplication and the binary representation of, say, R1:

// R1 = d0 * 1 + d1 * 2 + d2 * 4 + ... d14 * 2^14 (15 bit positive integer)
// R0 * R1 = (R0 * 1) * d0  + (R0 * 2) * d1 + ... (R0 * 2^14) * d14

// Since we can get each successive term by repeatedly doubling R0, and multiplication by 2 is quite an easy 
// special case, in most high level languages we can implement this with a few simple shifts:

// int term = R0;
// int product = 0;
// while(R1 > 0) {
//   if(R1 & 1) {
//     product += term; 
//   }
//   term <<= 1;
//   R1 >>= 1;
// }

// Since the hack architecture does not support bit shifts, we'll have to get slightly more creative
// For doubling, term = term + term will do the trick, obviously, even though an adder's a bit more complex than a shifter :)

// Instead of right shifting to read off each digit, we can run a bitmask from right to left — 0x1, 0x2, 0x4, 0x8, 0x10, etc..
// Finally, for a condition that terminates the loop we can make it architecture specific 
// and only run it 15 times, as that's the word length minus sign bit.

// This algorithm is way, way faster than the naive repeated addition, at O(logn) rather than O(n) in the general case,
// and more importantly O(1) for us since we're dealing with fixed length integers.

// Finally, for a bit of extra fun we can hand unroll the fixed loop and make it even 
// more blazingly fast after testing the initial looped implementation.
// I'll leave my first implementation in this file, commented out.

// 
//     // Setup
//     @R2
//     M=0
// 
//     @R0
//     D=M
//     @term
//     M=D
// 
//     @mask
//     M=1
// 
//     @15
//     D=A
//     @length
//     M=D
// 
//     @i
//     M=0
// 
// (LOOP)
// 
//     // Termination condition
// 
//     @length
//     D=M
//     @i
//     D=M-D
// 
//     @END
//     D;JGE
// 
//     // Check whether we're adding the current term or not (if R1's current bit is on or off)
//     @R1
//     D=M
//     @mask
//     D=D&M
//     @ITER
//     D;JEQ
// 
//     //If the bit isn't 0, add current term to the result
//     @term
//     D=M
//     @R2
//     M=M+D
// 
// (ITER)
//     @term
//     D=M
//     M=M+D
// 
//     @mask
//     D=M
//     M=M+D
// 
//     @i
//     M=M+1
//     @LOOP
//     0;JMP
// 
// (END)
//     @END
//     0;JMP
// 
//


// Unrolled version:

    // Setup
    @R2
    M=0

    @R0
    D=M
    @term
    M=D

    @mask
    M=1

//Loop 15 times here:

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER1
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER1)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER2
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER2)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER3
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER3)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER4
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER4)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER5
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER5)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER6
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER6)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

// Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER7
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER7)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER8
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER8)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER9
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER9)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER10
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER10)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER11
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER11)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER12
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER12)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

// Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER13
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER13)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @ITER14
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D

(ITER14)
    @term
    D=M
    M=M+D

    @mask
    D=M
    M=M+D

    // Check whether we're adding the current term or not (if R1's current bit is on or off)
    @R1
    D=M
    @mask
    D=D&M
    @END
    D;JEQ

    //If the bit isn't 0, add current term to the result
    @term
    D=M
    @R2
    M=M+D


(END)
    @END
    0;JMP
