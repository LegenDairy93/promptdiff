export function formatTable(rows: string[][]): string {
  if (rows.length === 0) {
    return "";
  }

  const widths = rows[0].map((_column, index) => {
    return Math.max(...rows.map((row) => row[index]?.length ?? 0));
  });

  return rows.map((row, rowIndex) => {
    const rendered = row.map((cell, index) => cell.padEnd(widths[index])).join("  ");
    if (rowIndex === 0 && rows.length > 1) {
      const separator = widths.map((width) => "-".repeat(width)).join("  ");
      return `${rendered}\n${separator}`;
    }
    return rendered;
  }).join("\n");
}
