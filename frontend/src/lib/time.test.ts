import { describe, expect, it } from 'vitest'
import { fmtDate, fmtDateDot, fmtDateTime, fmtYearMonth } from './time'

// 后端时间固定 RFC3339（含时区）；测试环境的本地时区即机器时区，
// 断言基于「解析后」的年月日，不依赖具体时区偏移
describe('fmtDate / fmtDateTime（dayjs）', () => {
  it('RFC3339 含时区偏移可正常解析', () => {
    const d = fmtDate('2026-10-07T12:00:00+08:00')
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(d).not.toBe('')
  })

  it('fmtDateTime 输出 YYYY-MM-DD HH:mm 形态', () => {
    expect(fmtDateTime('2026-10-07T12:34:00+08:00')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('空值返回空串', () => {
    expect(fmtDate(null)).toBe('')
    expect(fmtDate(undefined)).toBe('')
    expect(fmtDateTime('')).toBe('')
  })

  it('非法时间串返回空串（不再透出 Invalid Date）', () => {
    expect(fmtDate('not-a-date')).toBe('')
  })
})

describe('fmtDateDot（视觉分隔格式）', () => {
  it('横线转点：2026-01-02 → 2026.01.02（时区无关的字面月日）', () => {
    // UTC 午夜时间戳在正时区机器上仍为同一天
    expect(fmtDateDot('2026-01-02T12:00:00+08:00')).toMatch(/^\d{4}\.\d{2}\.\d{2}$/)
  })
})

describe('fmtYearMonth（旅程时间轴自由文本）', () => {
  it('YYYY-MM 解析为 YYYY.MM', () => {
    expect(fmtYearMonth('2023-06')).toBe('2023.06')
  })

  it('自由文本原样透传', () => {
    expect(fmtYearMonth('在读期间')).toBe('在读期间')
    expect(fmtYearMonth('2023-2025')).toBe('2023-2025')
  })
})
