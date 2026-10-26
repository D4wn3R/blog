// 分页响应统一形态（docs/API/README：全站仅分页包与 {list} 两种列表形态）
export interface PageDTO<T> {
  list: T[]
  total: number
  page: number
  page_size: number
}
