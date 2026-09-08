export default defineAppConfig({
  ui: {
    colors: {
      primary: 'outlook',
      neutral: 'zinc',
      success: 'emerald',
      warning: 'amber'
    },
    dashboardNavbar: {
      slots: { root: 'office-titlebar' }
    },
    dashboardToolbar: {
      slots: { root: 'office-command-ribbon' }
    },
    dashboardSidebar: {
      slots: { content: 'office-sidebar-mobile' }
    },
    table: {
      slots: {
        root: 'office-table',
        base: 'border-separate border-spacing-0',
        tbody: 'divide-y-0',
        tr: 'data-[selectable=true]:cursor-pointer',
        th: 'px-4 py-2.5',
        td: 'px-4 py-3 text-default',
        separator: 'h-0'
      },
      variants: {
        sticky: {
          true: { thead: 'bg-elevated', tfoot: 'bg-default' },
          header: { thead: 'bg-elevated' },
          footer: { tfoot: 'bg-default' }
        },
        pinned: { true: { th: 'bg-elevated', td: 'bg-default' } }
      }
    },
    tabs: {
      slots: { root: 'office-tabs', list: 'max-w-full overflow-x-auto', trigger: 'shrink-0' }
    },
    modal: {
      slots: {
        overlay: 'bg-(--mw-theme-overlay)',
        header: 'bg-muted',
        footer: 'bg-muted'
      }
    },
    slideover: {
      slots: {
        overlay: 'bg-(--mw-theme-overlay)',
        header: 'bg-muted',
        footer: 'bg-muted'
      }
    }
  }
})
