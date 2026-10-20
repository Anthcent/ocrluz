const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const SEPARATOR_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

type Segment = { type: 'text'; content: string } | { type: 'table'; header: string[]; rows: string[][] };

function parseRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i++;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseSegments(text: string): Segment[] {
  const lines = text.split('\n');
  const segments: Segment[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length) {
      segments.push({ type: 'text', content: textBuffer.join('\n') });
      textBuffer = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (TABLE_ROW.test(line) && next !== undefined && SEPARATOR_ROW.test(next)) {
      // header + separator confirmed; collect following data rows
      const header = parseRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      flushText();
      segments.push({ type: 'table', header, rows });
      continue;
    }
    textBuffer.push(line);
    i++;
  }
  flushText();
  return segments;
}

export function TextWithTables({ text, className }: { text: string; className?: string }) {
  const segments = parseSegments(text);
  return (
    <div className={className}>
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <p key={index} className="whitespace-pre-line">
            {segment.content}
          </p>
        ) : (
          <div key={index} className="my-4 overflow-x-auto rounded-xl ring-1 ring-swan">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="bg-polar">
                  {segment.header.map((h, i) => (
                    <th key={i} className="whitespace-nowrap border-b border-swan px-3 py-2 text-left font-bold text-eel">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-swan">
                {segment.rows.map((row, ri) => (
                  <tr key={ri}>
                    {segment.header.map((_, ci) => (
                      <td key={ci} className="px-3 py-2 align-top text-wolf">
                        {row[ci] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}
