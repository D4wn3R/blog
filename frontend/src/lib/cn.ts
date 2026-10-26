import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// 条件类名拼接：clsx 组合 + tailwind-merge 消解冲突类（后写者胜出，如同缀 border-* 互斥）
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
