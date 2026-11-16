// CSV building and download for exports. Pure string work plus a browser download; no data access.

const cell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** `title`, if given, is a single line above the header (e.g. which fortnight the file covers). */
export function toCsv(header: string[], rows: (string | number)[][], title?: string): string {
  return [...(title ? [[title]] : []), header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** Hands the viewer a file; nothing is uploaded anywhere. */
export function downloadCsv(filename: string, csv: string): void {
  // The byte-order mark tells Excel it's UTF-8; without it, "–" and accented names come out garbled.
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
