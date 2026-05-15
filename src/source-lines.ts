import { Renderer, type Token, type Marked, type MarkedExtension } from 'marked';

const BLOCK_TYPES = ['heading', 'paragraph', 'code', 'table', 'blockquote', 'list', 'hr', 'html'] as const;

type SourceLineToken = Token & { _line?: number };

export function sourceLines(markdown: string, lineMap?: number[]): MarkedExtension {
  const offsets = [0];
  for (let i = 0; i < markdown.length; i++) {
    if (markdown[i] === '\n') offsets.push(i + 1);
  }
  function charToLine(pos: number): number {
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  }

  let cursor = 0;

  return {
    walkTokens(token: Token) {
      if (!(BLOCK_TYPES as readonly string[]).includes(token.type)) return;
      const idx = markdown.indexOf(token.raw, cursor);
      if (idx >= 0) {
        const line = charToLine(idx);
        (token as SourceLineToken)._line = lineMap ? (lineMap[line - 1] ?? line) : line;
        cursor = idx;
      }
    }
  };
}

export function applySourceLineWrappers(marked: Marked): void {
  const prev = { ...marked.defaults.renderer } as Record<string, Function>;
  const proto = Renderer.prototype as unknown as Record<string, Function>;
  const wrappers: Record<string, Function> = {};
  for (const type of BLOCK_TYPES) {
    const original = prev[type] || proto[type];
    wrappers[type] = function (this: Renderer, token: SourceLineToken) {
      const html = original.call(this, token);
      if (!token._line || !html) return html;
      return (html as string).replace(/^(<\w+)/, `$1 data-source-line="${token._line}"`);
    };
  }
  marked.use({ renderer: wrappers as unknown as Partial<Renderer> });
}
