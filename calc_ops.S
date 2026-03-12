.intel_syntax noprefix
.text

.globl asm_add
asm_add:
    addsd xmm0, xmm1
    ret

.globl asm_sub
asm_sub:
    subsd xmm0, xmm1
    ret

.globl asm_mul
asm_mul:
    mulsd xmm0, xmm1
    ret

.globl asm_div
asm_div:
    divsd xmm0, xmm1
    ret
