// 时间格式化统一入口（dayjs）：后端产出 RFC3339（含时区），
// 解析后按浏览器本地时区展示——替代旧版对 +08:00 的字面 slice 假设
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

export function fmtDate(iso: string | null | undefined): string {
  return iso && dayjs(iso).isValid() ? dayjs(iso).format('YYYY-MM-DD') : ''
}

export function fmtDateTime(iso: string | null | undefined): string {
  return iso && dayjs(iso).isValid() ? dayjs(iso).format('YYYY-MM-DD HH:mm') : ''
}

// 视觉格式 2026.01.02（全站日期展示的赛博朋克分隔风格）
export function fmtDateDot(iso: string | null | undefined): string {
  return fmtDate(iso).replaceAll('-', '.')
}

// 旅程时间轴（自由字符串，惯例 YYYY-MM）：严格按该格式解析后展示 2023.06，
// 区间/自由文本（如 2023-2025、在读期间）原样透传
export function fmtYearMonth(time: string): string {
  const d = dayjs(time.trim(), 'YYYY-MM', true)
  return d.isValid() ? d.format('YYYY.MM') : time
}
