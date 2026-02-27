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
        // Remove null bytes and control chars except \t \n \r
        .replace(/\0/g, '')
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Remove empty lines
        .replace(/^\s*$/gm, '')
        // Collapse 3+ consecutive newlines to 2
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return cleaned;
}
