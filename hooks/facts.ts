import type { SessionMessage } from 'claude-code'

// What this session has touched, read from the transcript alone (no disk):
// files read or changed, the last command that failed, and the gist of
// Claude's last reply. Kept under about 300 tokens.

const FILE_TOOLS: Record<string, 'read' | 'changed'> = { Read: 'read', Edit: 'changed', Write: 'changed', MultiEdit: 'changed', NotebookEdit: 'changed' }
const MAX_CHARS = 1200

const tail = (s: string, n: number) => (s.length > n ? `...${s.slice(-n)}` : s)
const head = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s)

export function sessionFacts(rows: readonly SessionMessage[]): string {
  const read = new Set<string>()
  const changed = new Set<string>()
  let failed: { command: string; output: string } | null = null
  let lastReply = ''

  for (const row of rows) {
    if (row.role === 'assistant' && row.text.trim()) lastReply = row.text.trim()
    for (const use of row.toolUses ?? []) {
      const kind = FILE_TOOLS[use.tool]
      const path = typeof use.input?.file_path === 'string' ? use.input.file_path : typeof use.input?.notebook_path === 'string' ? use.input.notebook_path : null
      if (kind && path) {
        if (kind === 'changed') changed.add(path)
        else read.add(path)
      }
      if (use.tool === 'Bash' && typeof use.input?.command === 'string') {
        const out = use.text ?? ''
        // "0 failed" is a pass; "2 failed", FAIL, a traceback or an error line is not.
        const bad = use.isError === true || /\b(FAIL|FAILED|Traceback)\b|\w*Error\b|\b[1-9]\d* failed\b/.test(out)
        failed = bad ? { command: use.input.command, output: out } : null
      }
    }
  }
  for (const p of changed) read.delete(p)

  const lines: string[] = []
  if (changed.size) lines.push(`Files changed this session: ${[...changed].slice(-8).join(', ')}`)
  if (read.size) lines.push(`Files read this session: ${[...read].slice(-8).join(', ')}`)
  if (failed) lines.push(`Last command failed: ${head(failed.command, 120)}\nIts output ended with:\n${tail(failed.output.trim(), 400)}`)
  if (lastReply) lines.push(`Claude's last reply began: ${head(lastReply.replace(/\s+/g, ' '), 240)}`)
  const text = lines.join('\n')
  return text.length > MAX_CHARS ? head(text, MAX_CHARS) : text
}
