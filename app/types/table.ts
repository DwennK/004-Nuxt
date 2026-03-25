export interface DashboardTableColumn {
  id: string
  getCanHide: () => boolean
  getIsVisible: () => boolean
}

export interface DashboardTableApi {
  getColumn: (id: string) => {
    toggleVisibility: (value: boolean) => void
  } | undefined
  getAllColumns: () => DashboardTableColumn[]
  getFilteredRowModel: () => { rows: unknown[] }
  getState: () => {
    pagination: {
      pageIndex: number
      pageSize: number
    }
  }
  setPageIndex: (page: number) => void
}

export interface DashboardTableInstance {
  tableApi?: DashboardTableApi
}
