import { describe, it, expect } from 'vitest'
import { parseDiagnostics, buildEmCommand } from './compiler'

describe('buildEmCommand', () => {
  it('uses -O0 when requested', () => {
    expect(buildEmCommand('O0')).toContain('-O0')
    expect(buildEmCommand('O0')).not.toContain('-O2')
  })

  it('uses -O2 when requested', () => {
    expect(buildEmCommand('O2')).toContain('-O2')
  })

  it('always sets STANDALONE_WASM and points at /working', () => {
    const cmd = buildEmCommand('O0')
    expect(cmd).toContain('-sSTANDALONE_WASM=1')
    expect(cmd).toContain('-I/working')
    expect(cmd).toContain('/working/main.cpp')
    expect(cmd).toContain('/working/main.wasm')
  })
})

describe('parseDiagnostics', () => {
  it('extracts errors with line+col', () => {
    const stderr = `main.cpp:10:5: error: 'foo' was not declared in this scope
    foo();
    ^`
    const diags = parseDiagnostics(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({
      severity: 'error',
      line: 10,
      column: 5,
      message: "'foo' was not declared in this scope",
    })
  })

  it('extracts multiple warnings', () => {
    const stderr = `main.cpp:1:1: warning: a
main.cpp:2:1: warning: b
main.cpp:3:1: note: c`
    const diags = parseDiagnostics(stderr)
    expect(diags).toHaveLength(3)
    expect(diags.map((d) => d.severity)).toEqual(['warning', 'warning', 'note'])
  })

  it('returns empty array for clean compile output', () => {
    expect(parseDiagnostics('shared:INFO: (Emscripten: Running sanity checks)')).toEqual([])
  })
})
