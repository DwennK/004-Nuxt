import { createSharedComposable } from '@vueuse/core'

export const dashboardThemes = ['outlook', 'excel', 'onenote', 'powerpoint', 'sharepoint'] as const

export type DashboardTheme = typeof dashboardThemes[number]

type DashboardThemeOption = {
  value: DashboardTheme
  label: string
  description: string
  icon: string
  appClass: string
  primaryColor: DashboardTheme
  neutralColor: 'zinc'
  swatch: string
}

export const dashboardThemeOptions: DashboardThemeOption[] = [{
  value: 'outlook',
  label: 'Outlook',
  description: 'Bleu Outlook, ruban clair et listes nettes.',
  icon: 'i-lucide-mail',
  appClass: 'outlook-app',
  primaryColor: 'outlook',
  neutralColor: 'zinc',
  swatch: '#0f6cbd'
}, {
  value: 'excel',
  label: 'Excel',
  description: 'Vert Excel et en-têtes structurés comme une feuille de calcul.',
  icon: 'i-lucide-table-2',
  appClass: 'excel-app',
  primaryColor: 'excel',
  neutralColor: 'zinc',
  swatch: '#217346'
}, {
  value: 'onenote',
  label: 'OneNote',
  description: 'Violet OneNote et onglets inspirés des intercalaires.',
  icon: 'i-lucide-notebook-tabs',
  appClass: 'onenote-app',
  primaryColor: 'onenote',
  neutralColor: 'zinc',
  swatch: '#7719aa'
}, {
  value: 'powerpoint',
  label: 'PowerPoint',
  description: 'Orange PowerPoint et surfaces sobres comme une diapositive.',
  icon: 'i-lucide-presentation',
  appClass: 'powerpoint-app',
  primaryColor: 'powerpoint',
  neutralColor: 'zinc',
  swatch: '#c43e1c'
}, {
  value: 'sharepoint',
  label: 'SharePoint',
  description: 'Sarcelle SharePoint et ruban souligné pour un espace partagé.',
  icon: 'i-lucide-network',
  appClass: 'sharepoint-app',
  primaryColor: 'sharepoint',
  neutralColor: 'zinc',
  swatch: '#03787c'
}]

export const dashboardThemeLabels = dashboardThemeOptions.reduce((labels, option) => {
  labels[option.value] = option.label

  return labels
}, {} as Record<DashboardTheme, string>)

function normalizeDashboardTheme(value: unknown): DashboardTheme {
  return dashboardThemes.includes(value as DashboardTheme) ? value as DashboardTheme : 'outlook'
}

function getDashboardThemeOption(theme: DashboardTheme) {
  return dashboardThemeOptions.find(option => option.value === theme) || dashboardThemeOptions[0]!
}

const _useDashboardTheme = () => {
  const appConfig = useAppConfig()
  const themeCookie = useCookie<DashboardTheme>('mw-dashboard-theme', {
    default: () => 'outlook',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax'
  })

  if (themeCookie.value !== normalizeDashboardTheme(themeCookie.value)) {
    themeCookie.value = normalizeDashboardTheme(themeCookie.value)
  }

  const dashboardTheme = computed<DashboardTheme>({
    get: () => normalizeDashboardTheme(themeCookie.value),
    set: (value) => {
      themeCookie.value = normalizeDashboardTheme(value)
    }
  })

  const currentDashboardTheme = computed(() => getDashboardThemeOption(dashboardTheme.value))

  watchEffect(() => {
    const option = currentDashboardTheme.value

    appConfig.ui.colors.primary = option.primaryColor
    appConfig.ui.colors.neutral = option.neutralColor
  })

  return {
    dashboardTheme,
    dashboardThemes,
    dashboardThemeOptions,
    dashboardThemeLabels,
    currentDashboardTheme,
    isExcelDashboardTheme: computed(() => dashboardTheme.value === 'excel')
  }
}

export const useDashboardTheme = createSharedComposable(_useDashboardTheme)
