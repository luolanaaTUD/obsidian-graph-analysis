/**
 * Shared utilities for cleaning raw note content before AI processing.
 */

/**
 * Minimal cleanup for raw note content: strip YAML frontmatter, remove empty lines,
 * and strip invalid characters. Preserves markdown structure (headers, links, code blocks, etc.).
 */
export function cleanupNoteContent(content: string): string {
    let cleaned = content
        // Remove YAML frontmatter (Obsidian note properties)
        .replace(/^---[\s\S]*?---\n?/m, '')
        // Remove null bytes
        .replace(/\0/g, '');

    // Remove control chars except \t \n \r (avoids no-control-regex)
    cleaned = cleaned
        .split('')
        .filter((c) => {
            const code = c.charCodeAt(0);
            return (code > 0x1f && code !== 0x7f) || code === 0x09 || code === 0x0a || code === 0x0d;
        })
        .join('');

    return cleaned
        // Remove empty lines
        .replace(/^\s*$/gm, '')
        // Collapse 3+ consecutive newlines to 2
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
