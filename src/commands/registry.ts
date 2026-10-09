export type CommandScope = 'Global' | 'Workspace' | 'Tab' | 'Viewer' | 'Edit';
export interface Command { id: string; title: string; category?: string; shortcut?: string; enabled?: boolean; visible?: boolean; keywords?: string; scope: CommandScope; execute(): void | Promise<void> }
export function fuzzyScore(query: string, value: string) {
  const q = query.toLocaleLowerCase().trim(), text = value.toLocaleLowerCase(); if (!q) return 1;
  if (text === q) return 1000; if (text.startsWith(q)) return 800 - text.length;
  const at = text.indexOf(q); if (at >= 0) return 600 - at;
  let cursor = 0, score = 0; for (const c of q) { const found = text.indexOf(c, cursor); if (found < 0) return -1; score += found === cursor ? 10 : 1; cursor = found + 1; } return score;
}
export class CommandRegistry {
  constructor(readonly commands: Command[]) {}
  search(query: string) { return this.commands.filter(c => c.visible !== false).map(c => ({ c, score: fuzzyScore(query, `${c.title} ${c.keywords ?? ''}`) })).filter(r => r.score >= 0).sort((a, b) => b.score - a.score).map(r => r.c); }
  execute(id: string) { const command = this.commands.find(c => c.id === id); if (command && command.enabled !== false && command.visible !== false) return command.execute(); }
}
