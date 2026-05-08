import type { MarkedExtension } from 'marked';

export function slugify(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
    .toLowerCase().replace(/[^\w一-鿿\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function createHeadingRenderer(): MarkedExtension {
  const seen = new Map<string, number>();
  return {
    hooks: {
      preprocess(markdown: string) {
        seen.clear();
        return markdown;
      }
    },
    renderer: {
      heading(this: { parser: { parseInline(t: unknown[]): string } }, { text, depth, tokens }: { text: string; depth: number; tokens?: unknown[] }) {
        const inner = tokens ? this.parser.parseInline(tokens) : text;
        const base = slugify(text);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      }
    }
  };
}
