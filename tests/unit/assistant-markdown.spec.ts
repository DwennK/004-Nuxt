import { describe, expect, it } from 'vitest'
import { renderAssistantMarkdown } from '../../app/utils/assistantMarkdown'

describe('assistant Markdown rendering', () => {
  it('renders emphasis, lists and a scrollable table without preserving empty lines', () => {
    const html = renderAssistantMarkdown('**Total : 69,90 CHF**\n\n\n\n| Client | Total |\n| --- | ---: |\n| Comptoir | 69,90 CHF |\n\n- 3 paiements\n- *Cette semaine*')
    expect(html).toContain('<strong>Total : 69,90 CHF</strong>')
    expect(html).toContain('class="assistant-table"')
    expect(html).toContain('<th>Client</th>')
    expect(html).toContain('<td style="text-align:right">69,90 CHF</td>')
    expect(html).toContain('<ul>\n<li>3 paiements</li>')
    expect(html).toContain('<em>Cette semaine</em>')
    expect(html).not.toContain('<br>')
    expect(html).not.toContain('<p></p>')
  })

  it('escapes raw HTML and code rather than executing model content', () => {
    const html = renderAssistantMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n```html\n<iframe src="/admin"></iframe>\n```')
    expect(html).not.toMatch(/<(script|img|iframe)\b/)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('<pre><code class="language-html">&lt;iframe')
  })

  it.each([
    '[ouvrir](javascript:alert(1))',
    '[ouvrir](JaVaScRiPt:alert(1))',
    '[ouvrir](javascript&#58;alert(1))',
    '[ouvrir](vbscript:alert(1))',
    '[ouvrir](data:text/html;base64,PHNjcmlwdD4=)'
  ])('rejects unsafe Markdown links: %s', (content) => {
    expect(renderAssistantMarkdown(content)).not.toContain('<a ')
  })

  it('keeps normal links and displays image descriptions without loading remote assets', () => {
    const html = renderAssistantMarkdown('[Tickets](/tickets)\n\n![Graphique <img src=x>](https://example.com/tracker.png)')
    expect(html).toContain('<a href="/tickets">Tickets</a>')
    expect(html).toContain('Graphique &lt;img src=x&gt;')
    expect(html).not.toMatch(/<img\b|src="|tracker\.png/)
  })
})
