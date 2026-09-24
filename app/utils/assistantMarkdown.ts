import MarkdownIt from 'markdown-it'

// Provider output is untrusted: keep HTML disabled and the default URL validation.
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false })

// Keep wide results scrollable within the message, including on mobile.
markdown.renderer.rules.table_open = () => '<div class="assistant-table" role="region" aria-label="Tableau de résultats" tabindex="0"><table>\n'
markdown.renderer.rules.table_close = () => '</table></div>\n'

// Responses are text/data only; never load remote images suggested by the model.
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index]?.content ?? '')

export function renderAssistantMarkdown(content: string) {
  return markdown.render(content)
}

// Keep completed blocks stable in the DOM while only the final block grows.
export function renderAssistantMarkdownBlocks(content: string) {
  const tokens = markdown.parse(content, {})
  const blocks: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < tokens.length; index++) {
    depth += tokens[index]!.nesting
    if (depth === 0) {
      blocks.push(markdown.renderer.render(tokens.slice(start, index + 1), markdown.options, {}))
      start = index + 1
    }
  }
  return blocks
}
